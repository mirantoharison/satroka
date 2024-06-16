const electron = require("electron");
const ipc = electron.ipcMain;
const browser = electron.BrowserWindow;
const dialog = electron.dialog;
const app = electron.app;
const Menu = electron.Menu;

const http = require("http");
const fs = require("fs");
const os = require("os");
const net = require("net");
const datastore = require("nedb-promise");
const path = require("path");

const express = require("express");
const currentWeekNumber = require("current-week-number");
const spawn = require("child_process").spawn;
const socket = require("socket.io").Server;

let expressapp;
let server;
let io;

const draw_window = (title, minWidth, maxWidth, modal = false) => {
    return new browser({
        modal: modal ? true : false,
        parent: modal ? modal : null,
        center: true,
        movable: true,
        title: title,
        //width: minWidth,
        minWidth: minWidth,
        maxWidth: maxWidth,
        maximize: false,
        webPreferences: {
            preload: path.join(__dirname, "preload", "main.js"),
            nodeIntegration: false,
            contextIsolation: true,
        }
    });
}

let listener;

let user;
let main;
let main_server_detail;
let selected_files_datastore = datastore();
let history_datastore_filepath = path.join(os.homedir(), ".tendry_history");
let history_datastore = datastore();
let history_saved = false;
let explored_files_datastore;
let search_files_datastore;

let download_destination;
let download_destination_ready = false;
let file_watcher;

let worker_thread;
let drive_list;

let es_search_parameters = null;
let es_search_count;
let es_search_page;

let _got_stream;

let _es_args;
let _es_process;
let connected_sockets = {};
let connected_users = {};


const max_result_number = 100;

const min_window_width = 760;
const max_window_width = 960;

app.on("ready", async () => {
    await restore_history_database_from_file();
    await selected_files_datastore.remove({}, { multi: true });
    search_files_datastore = datastore();

    const compute_file_size = async () => {
        const file_total = await selected_files_datastore.find({}, { size: 1 });
        const file_total_count = file_total.length;
        const file_total_size = file_total.length > 0 ?
            Array.from(file_total).map((file) => file.size).reduce((a, b) => parseInt(a) + parseInt(b)) :
            Array.from([]).length;
        main.webContents.send("saved-list", JSON.stringify({ count: file_total_count, size: file_total_size }));
    }

    const build_file_stats = async (file_element) => {
        return new Promise((resolve) => fs.stat(file_element.path, (err, stats) => {
            file_element.size = 0;

            if (err) {
                console.error(err);
                file_element.order = 3;
            }
            else {
                if (stats.isDirectory()) {
                    file_element.folder = true;
                    file_element.order = 1;
                }
                if (stats.isFile()) {
                    file_element.file = true;
                    file_element.size = stats.size;
                    file_element.order = 2;
                }
                file_element.ctime = stats.birthtime;
                file_element.mtime = stats.ctime;
            }

            file_element.virtualname = path.basename(file_element.path).toLocaleUpperCase();
            file_element.name = path.basename(file_element.path);

            resolve(file_element);
        }));
    }

    try {
        main = draw_window("Partage de fichier", min_window_width, max_window_width);
        main.setMenu(build_menu(false));
        main.loadFile(path.join(__dirname, "layouts", "main.html"));
        main.show();
    }
    catch (err) {
        console.log(err);
    }

    ipc.on("drive-list", async (e) => {
        let drives;
        try {
            const fsd = require("detect-drives");
            drives = await fsd.detectDrives();
        }
        catch (err) {
            console.error(err);
        }
        finally {
            drive_list = [...drives];
            e.returnValue = drives;
        }
    });

    ipc.on("drive-explore", async (e, params) => {
        let _parameter = JSON.parse(params);
        let _folder_path;

        _folder_path = path.normalize(_parameter.path);

        file_watcher?.close();
        file_watcher = fs.watch(_folder_path, (e, file) => {
            console.log(e);
            if (e === "rename") main.webContents.send("path-changed");
        });

        fs.readdir(_folder_path, async (err, _folder_elements) => {
            if (err) {
                dialog.showMessageBox(main, {
                    message: "Opération non autorisée",
                    detail: `Impossible de scanner le dossier <${_folder_path}> pour la raison suivante : ${err.code === "EPERM" ? "Opération non permise. Il se pourrait que le dossier soit bloqué par un autre processus ou encore que vous n'avez pas les autorisation pour effectuer l'opération" : ""}`,
                    title: "Erreur de lecture",
                    type: "error",
                });
                e.returnValue = null;
            }

            for (var i = 0; i < _folder_elements.length; i++) {
                let _element = {};
                _element.path = path.resolve(_parameter.path, _folder_elements[i]);
                _element = await build_file_stats(_element);

                _folder_elements[i] = _element;
            }

            _folder_elements.filter((_element) => _element !== null);

            // sort the list of elements
            explored_files_datastore = datastore();
            await explored_files_datastore.remove({}, { multi: true });
            await explored_files_datastore.insert([..._folder_elements]);

            let _order = {};
            _order["order"] = 1;
            _order[_parameter.order_parameter] = _parameter.order_value;
            _order["virtualname"] = _parameter.order_parameter === "name" ? _parameter.order_value : 1;
            delete _order.name;

            console.log(_order, await explored_files_datastore.cfind({}).sort({ ..._order }).exec())
            e.returnValue = await explored_files_datastore.cfind({}).sort({ ..._order }).exec();
        });
    });

    ipc.on("drive-full-scan", (e) => {
        /*worker_thread = new Worker(path.join(__dirname, "explore.js"));
        worker_thread.postMessage("E:\\");
        worker_thread.on("message", (message) => {
            if (message.key === "saving_start") main.webContents.send("drive-full-scan-saving");
            else if (message.key === "database_created") {
                main.webContents.send("drive-full-scan-complete");
                worker_thread.terminate();
                worker_thread = undefined;
            }
        });*/
    });

    ipc.on("drive-search", async (e, search_params) => {
        const csvparse = require("csv-parse/sync").parse;

        const _es_lib_path = path.join(__dirname, "lib");
        const _es = path.join(_es_lib_path, "es.exe");

        const _format_search_result = (_element_csv) => {
            _element_csv.reverse();

            const _element_json = {};
            _element_json["size"] = _element_csv.length > 0 ? _element_csv.pop() : "";
            _element_json["ctime"] = _element_csv.pop();
            _element_json["mtime"] = _element_csv.pop();
            _element_json["file"] = !_element_json["folder"];
            _element_json["folder"] = /D/.test(_element_csv.pop());
            _element_json["path"] = _element_csv.slice(0).reverse().join(",");
            _element_json["name"] = path.basename(_element_json["path"]);
            _element_json["virtualname"] = path.basename(_element_json["path"]).toLocaleUpperCase();

            return _element_json;
        }

        try {
            const _search_params = { ...search_params };
            const _value = _search_params.name;
            const _restore = _search_params.restore;
            const _result = {};

            const _directory_closure = _search_params.directoryClosure;
            const _directory = _search_params.directoryToSearch;
            const _lock_only_directory = _search_params.directoryOnly;
            const _whole_word = _search_params.matchWord;

            let _page = parseInt(_search_params.page) || 1;
            let _offset = (_page - 1) * max_result_number;

            // we delete page as it does not concern the global value of the query
            delete search_params._id;
            delete search_params.page;
            delete search_params.restore;

            // first we need to get the total count of the result if not the same search
            if (
                (_restore === true) ||
                (es_search_parameters === null) ||
                (es_search_parameters && JSON.stringify(search_params) !== es_search_parameters)
            ) {
                es_search_parameters = JSON.stringify(search_params);
                es_search_page = 1;

                _es_args = ["-get-result-count"];
                _es_process = spawn(_es, [].concat(_es_args, _value));
                await new Promise((resolve) => {
                    _es_process.stdout.on("data", (data) => es_search_count = parseInt(data));
                    _es_process.on("close", () => resolve(true));
                });

                _result["page"] = Math.ceil(es_search_count / max_result_number);
                _restore ? _result["restore"] = true : null;
                _restore ? _page = _page : _page = 1;
                // recalculate offset
                _offset = (_page - 1) * max_result_number;

                main.webContents.send("search-count-result-page", _result);
            }

            _es_args = ["-size", "-dc", "-dm", "-attrib", "-o", _offset, "-max-results", max_result_number];

            if (_whole_word) _es_args.push("-ww");
            if (_directory_closure && _directory) _es_args.push("-parent", _directory);
            if (_lock_only_directory) _es_args.push("/ad");

            switch (search_params.sortColumn) {
                case "name": _es_args.push("-sort-name"); break;
                case "mtime": _es_args.push("-sort-date-created"); break;
                case "ctime": _es_args.push("-sort-date-modified"); break;
                case "size": _es_args.push("-sort-size"); break;
            }
            _es_args[_es_args.length - 1] += search_params.sortOrder === "1" ? "-ascending" : "-descending";
            _es_args.push("-csv", "-no-header");

            _es_process = null;
            _es_process = spawn(`cmd /c chcp 65001>null && ${_es}`, [].concat(_es_args, _value), { shell: true });

            let _result_string = "";
            _es_process.stdout.on("data", async (data) => _result_string += data.toString("utf-8"));
            _es_process.on("close", async () => {
                let _t;

                _result_string = _result_string.replace(/[\r"]/g, "");
                _result_string = _result_string.split("\n");
                _t = _result_string.slice(0, _result_string.length - 1);
                _result_string = _result_string.length > 1 ? _result_string.pop() : "";

                for (let _element of _t) {
                    _element = csvparse(_element, { encoding: "utf-8", delimiter: "," })[0];
                    main.webContents.send("search-append-result", _format_search_result(_element));
                }

                main.webContents.send("search-result-end");
            });
        }
        catch (err) {
            console.error(err);
            dialog.showMessageBox(main, {
                message: "Une erreur s'est produite durant la recherche",
                detail: "Nous n'avons pas pu mener la recherche à son terme pour la raison suivante : . Si le souci persiste et que celui-ci ne provient pas d'une de votre manipulation, nous vous prions de contacter immédiatement notre équipe technique. Merci de votre compréhension.",
                title: "Erreur",
                type: "error",
            });
        }
    });

    ipc.on("search-cancel", (e) => {
        if (_es_process) {
            _es_process.stdout.pause();
            _es_process.stdout.destroy();
            _es_process.kill("SIGKILL");
            _es_process = null;
        }

        _result_string = "";

        e.returnValue = true;
    });

    ipc.on("drive-group-category", (e, category) => {
        // syntax es "es.exe ext:jpeg;bmp"
    });



    ipc.on("connect", async (e, connection_data) => {
        user = { ...JSON.parse(connection_data) };
        e.returnValue = true;
        draw_send_window();
    });

    ipc.on("check-ready-state", (e, socketid) => {
        const _socket = connected_sockets[socketid];
        _socket.emit("check-ready-state");
    });

    ipc.on("check-own-ready-state", (e) => e.returnValue = download_destination_ready);



    ipc.on("test", async (e) => {
        console.log(await history_datastore.find({}));
        //console.log(connected_sockets);
    })


    ipc.on("save-history", async (e, history_data) => {
        const currentWeekNo = require("current-week-number");

        if (history_data) {
            const _data = { ...history_data };
            _data["date"] = new Date();
            _data["noday"] = new Date().getDate();
            _data["noweek"] = currentWeekNo(new Date());
            _data["nomonth"] = new Date().getMonth();
            _data["noyear"] = new Date().getFullYear();

            if (_data.type === "explore") {
                _data["name"] = path.basename(_data.path);
                _data["virtualname"] = _data.name.toLocaleUpperCase();
            }
            else if (_data.type === "transfert") {
                _data["users"] = { ...connected_users };
            }

            history_datastore.insert({ ..._data });
        }
    });

    ipc.on("get-history", async (e, params) => {
        let _parameter = { ...params };
        let _search = {};

        let _current = new Date();
        let _current_noday = _current.getDate();
        let _current_noweek = currentWeekNumber(_current);
        let _current_nomonth = _current.getMonth();
        let _current_noyear = _current.getFullYear();

        if (_parameter.search_word) _search["name"] = { "$regex": new RegExp(_parameter.search_word, "i") };
        if (_parameter.search_date_type) {
            switch (_parameter.search_date_type) {
                case "now": _search["$and"] = [{ noday: _current_noday }, { nomonth: _current_nomonth }, { noyear: _current_noyear }]; break;
                case "week": _search["$and"] = [{ noday: { $lt: _current_noday } }, { noweek: _current_noweek }, { noyear: _current_noyear }]; break;
                case "month": _search["$and"] = [{ noweek: { $lt: _current_noweek } }, { nomonth: _current_nomonth }, { noyear: _current_noyear }]; break;
                case "year": _search["$and"] = [{ nomonth: { $lt: _current_nomonth } }, { noyear: _current_noyear }]; break;
                case "old": _search["$and"] = [{ noyear: { $lt: _current_noyear } }]; break;
                default: null; break;
            }
        }

        console.log(params)
        console.log(_search)
        e.returnValue = await history_datastore.cfind(_search).sort({ date: -1 }).exec();
    });



    ipc.on("save-list", async (e, list) => {
        let _file_check = await selected_files_datastore.findOne({ ...list });

        if (!_file_check) {
            let _file = await build_file_stats({ path: list.path });
            let _file_id = await selected_files_datastore.insert(_file);
            //await compute_file_size();

            e.returnValue = _file_id._id;
        }
        else {
            //await compute_file_size();
            e.returnValue = _file_check._id;
        }
    });

    ipc.on("test-path", async (e, test_path) => {
        const _test_path = test_path + "\\";
        const _test_result = await selected_files_datastore.findOne({ path: _test_path });
        e.returnValue = _test_result ? true : false;
    });

    ipc.on("get-list", async (e, params) => {
        let _parameter = JSON.parse(params);
        let _order = {};

        _order["order"] = 1;
        _order[_parameter.order_parameter] = _parameter.order_value;
        _order["virtualname"] = _parameter.order_parameter === "name" ? _parameter.order_value : 1;
        e.returnValue = await selected_files_datastore.cfind({}).sort({ ..._order }).exec();
    });

    ipc.on("delete-list", async (e, _path) => {
        await selected_files_datastore.remove({ ..._path });
        //await compute_file_size();

        e.returnValue = true;
    });

    ipc.on("reset-list", async (e) => {
        await selected_files_datastore.remove({});
        e.returnValue = true;
    });


    ipc.on("choose-path-destination", (e, _path) => {
        try {
            if (fs.existsSync(_path)) {
                fs.statSync(_path);
                download_destination = _path;
                download_destination_ready = true;
                e.returnValue = true;
            }
        }
        catch (err) {
            console.error(err);
            dialog.showMessageBoxSync(main, {
                title: "Erreur",
                message: `Nous avons rencontré une erreur lors de la définition du dossier <${_path}> comme dossier de destination des téléchargements`,
                type: "error",
                detail: JSON.stringify(err),
            });
            e.returnValue = false;
        }
    });

    ipc.on("start-upload", async (e) => {
        if (server) {
            if (Object.values(connected_sockets).length > 0) {
                const _server = server.address();
                const _file_list = [...await selected_files_datastore.find({}, { path: 1, name: 1, _id: 1 })];

                if (_file_list.length > 0) {
                    const sockets = Object.keys(connected_sockets);
                    sockets.forEach((socketid) => connected_sockets[socketid].emit("start-download", JSON.stringify({ socketid: socketid, ip: _server.address, port: _server.port, filelist: _file_list })));
                    e.returnValue = true;
                }
                else {
                    dialog.showMessageBox(main, {
                        type: "info",
                        message: "Aucun fichier à téléverser",
                        detail: "Avant de téléverser des fichiers, vérifier bien que vous avez séléctionné au moins un fichier. Pour cela, cliquer sur le bouton << + >> et une fenêtre s'afficherait à l'écran vous demandant par la suite de naviguer dans vos dossiers et de choisir quelques fichiers.",
                        title: "Aucun fichier à télécharger",
                    });
                    e.returnValue = false;
                }
            }
            else {
                dialog.showMessageBox(main, {
                    type: "warning",
                    message: "Aucun utilisateur connecté",
                    detail: "Vu qu'aucun utilisateur n'est connecté sur le réseau de partage, nous avons momentannément interrompu le téléversement du(des) fichier(s). Veuillez communiquer votre adresse ainsi que le port de communication qui figure, et d'attendre que d'autres utilisateurs se connectent au réseau avant de reprendre l'opération.",
                    title: "Interruption du transfert",
                });
                e.returnValue = false;
            }
        }
        else {
            dialog.showMessageBox(main, {
                type: "error",
                message: "Aucun serveur retrouvé",
                detail: "Lors du lancement du processus de transfert, nous n'avons trouvé aucune instance de serveur démarrée sur cette machine. Veuillez cliquer sur le bouton << démarrer >> pour lancer le service. Notez qu'il est IMPOSSIBLE d'envoyer ou de recevoir un fichier tant que ce serveur n'est pas opérationnel.",
                title: "Erreur de transfert",
            });
            e.returnValue = false;
        }
    });

    ipc.on("start-download", async (e, data) => {
        if (download_destination) {
            const Size = require("./layouts/scripts/size-converter");
            const got = (await import("got")).default;

            const _data = { ...JSON.parse(data) };
            const _ip = _data.ip;
            const _port = _data.port;
            const _socketid = _data.socketid;

            try {
                let _files;
                _files = [..._data.filelist];

                for (const _index in _files) {

                    // first we get the total size of the file
                    const _got_stream_data = await got({
                        method: "get",
                        url: `http://${_ip}:${_port}/download/file/detail`,
                        searchParams: { filepath: _files[_index].path },
                    }).json();

                    _files[_index].ext = path.extname(_files[_index].path).slice(1);

                    _files[_index].btime = new Date(_got_stream_data.btime);
                    _files[_index].btime = `${_files[_index].btime.toLocaleDateString("fr")} ${_files[_index].btime.toLocaleTimeString("fr")}`;
                    _files[_index].ctime = new Date(_got_stream_data.ctime);
                    _files[_index].ctime = `${_files[_index].ctime.toLocaleDateString("fr")} ${_files[_index].ctime.toLocaleTimeString("fr")}`;
                    _files[_index].size = _got_stream_data.size;
                    _files[_index].sizestring = Size.convertToOptimum({ size: _got_stream_data.size, accuracy: 3 });
                    _files[_index].sizestring = `${_files[_index].sizestring.value}${_files[_index].sizestring.unit}`;
                }

                for (const _filepath of _files) {

                    await new Promise((resolve, reject) => {
                        const _destpath = path.join(download_destination, path.basename(_filepath.path));
                        const _readstart = 0;
                        //const _readstart = fs.existsSync(_destpath) ? fs.statSync(_destpath).size : 0;
                        const _download = () => {
                            const _writeoptions = {};
                            if (_readstart !== 0) {
                                _writeoptions.start = _readstart;
                                _writeoptions.flags = "a";
                            }
                            const _write_stream = fs.createWriteStream(_destpath, _writeoptions);

                            _write_stream.on("error", (err) => reject(err));
                            _write_stream.on("finish", () => {
                                main.webContents.send("path-destination-changed");
                                main.webContents.send("progress-download-finish");
                                resolve(true);
                            });

                            // then we sent data for rendering
                            main.webContents.send("detail-file-download", JSON.stringify({ ..._filepath }));

                            // then we launch the stream download
                            _got_stream = null;
                            _got_stream = got({
                                method: "get",
                                url: `http://${_ip}:${_port}/download`,
                                searchParams: { filepath: _filepath.path, start: _readstart },
                                isStream: true,
                            });
                            _got_stream.on("downloadProgress", (progress) => {
                                progress.percent = progress.transferred / _filepath.size;
                                progress.transferredstring = Size.convertToOptimum({ size: progress.transferred, accuracy: 3 });
                                progress.transferredstring = progress.transferred > 0 ?
                                    `${progress.transferredstring.value}${progress.transferredstring.unit}` :
                                    `0o`;

                                main.webContents.send("progress-download", JSON.stringify(
                                    Object.assign(
                                        { socketid: _socketid, ip: _ip, port: _port },
                                        { ...progress },
                                        { ..._filepath }
                                    )
                                ))
                            });
                            _got_stream.on("end", () => null);
                            _got_stream.on("error", (err) => reject(err));
                            _got_stream.pipe(_write_stream);
                        }

                        if (!fs.existsSync(_destpath)) _download();
                        else {
                            const _response = dialog.showMessageBoxSync(main, {
                                message: `Nous avons constaté que le fichier <${_destpath}> existe déjà dans votre répértoire de destination.\nVoulez-vous le supprimer et recommencer le téléchargement depuis le début ou passer le fichier ?`,
                                buttons: ["Supprimer et démarrer", "Passer", "Annuler"],
                                title: "Confirmation de téléchargement",
                                type: "question"
                            });

                            switch (_response) {
                                case 0: fs.rmSync(_destpath); _download(); break;
                                case 1: resolve(false); break;
                                case 2: null; break;
                                default: resolve(true); break;
                            }
                        }
                    });
                }
            }
            catch (err) {
                console.error(err);
            }
        }
        else {
            dialog.showMessageBoxSync(main, {
                title: "Aucun dossier de destination sélectionné",
                message: "Pas de dossier de destination",
                detail: `Afin de démarrer des téléchargements, vous devez impérativement séléctionner un dossier déjà existant ou créer un, vous attribuez la pleine permission sur ce dossier et le choisir en tant que destination. Par défaut, nous allons mettre votre dossier de destination sur <${os.homedir()}>.\nNotez que vous pouvez toujours choisir un autre dossier en parcourant les disques ou en recherchant un nom de dossier spécifique.`,
                type: "warning",
            });
        }
    });

    ipc.on("cancel-upload", (e) => {
        const sockets = Object.keys(connected_sockets);
        sockets.forEach((socketid) => connected_sockets[socketid].emit("cancel-download"));
        e.returnValue = true;
    });

    ipc.on("cancel-download", () => { _got_stream?.destroy(); });

    ipc.on("start-server", async (e) => {
        let connection_dialog_signal;
        let connection_dialog_window;
        let connection_interface;
        let ipv4_inteface;

        connection_interface = Object.values(os.networkInterfaces());
        ipv4_inteface = connection_interface.map((interface) => interface.filter((connection) => !connection.internal && net.isIPv4(connection.address)));
        ipv4_inteface = ipv4_inteface.filter((interface) => interface.length > 0);
        ipv4_inteface = ipv4_inteface[0] && ipv4_inteface[0].length > 0 ? String(ipv4_inteface[0][0].address) : "127.0.0.1";

        expressapp = express();
        server = http.createServer(expressapp);
        io = new socket(server);

        io.on("connection", (socket) => {
            connected_sockets[socket.id] = socket;

            socket.on("socket-detail", (data) => {
                const socket_detail = { ...JSON.parse(data) };

                connected_users[socket.id] = { ...socket_detail };

                main.webContents.send("user-connected", JSON.stringify(Object.assign(
                    { type: "connection-details" },
                    { socketid: socket.id },
                    { ...socket_detail },
                )));
            });

            socket.on("check-ready-state", (state) => main.webContents.send("user-ready-state", socket.id, state));

            socket.on("process-detail", (data) => {
                main.webContents.send("user-process-detail", JSON.stringify(
                    Object.assign(
                        {},
                        { ...JSON.parse(data) },
                        { ...connected_users[socket.id] }
                    )
                ));
            });

            socket.on("progress", (progressdata) => {
                console.log(progressdata);
                //socket.emit("download-test", { ...progressdata });

                main.webContents.send("progress", progressdata);
            });

            socket.on("disconnect", () => {
                delete connected_sockets[socket.id];
                delete connected_users[socket.id];

                main.webContents.send("user-disconnected", JSON.stringify(Object.assign(
                    { type: "disconnection-details" },
                    { socketid: socket.id },
                )));
            });
        });

        // if all is set, we show a message notification on the screen
        connection_dialog_signal = new AbortController();
        connection_dialog_window = dialog.showMessageBox(main, {
            type: "info",
            title: "Demarrage du serveur",
            message: "Demarrage du serveur en cours. Veuillez patienter ...",
            signal: connection_dialog_signal.signal
        });

        // this lines are for the management of the server
        expressapp.use(express.json());
        expressapp.use(express.urlencoded({ extended: false }));

        expressapp.post("/transfert/start", async (req, res) => {
            const _server = listener.address();
            const _data = { ...req.body };
            const _file_list = [..._data.filelist];

            const sockets = Object.keys(connected_sockets);
            sockets.forEach((socketid) => {
                console.log("id du socket ", socketid)
                connected_sockets[socketid].emit("start-download", JSON.stringify({ socketid: socketid, ip: _server.address, port: _server.port, filelist: _file_list }));
            });

            //io.emit("start-download", JSON.stringify({ ip: _server.address, port: _server.port, filelist: _file_list }));
            res.send(true);
        });
        expressapp.get("/download", (req, res) => {
            const _data = { ...req.query };
            const _file = fs.createReadStream(_data.filepath, { start: parseInt(_data.start) });
            _file.pipe(res);
        });
        expressapp.get("/download/file/detail", (req, res) => {
            const _data = { ...req.query };
            const _filepath = _data.filepath;
            const _filedetail = fs.statSync(_filepath);
            res.send({
                size: _filedetail.size,
                btime: _filedetail.birthtime,
                ctime: _filedetail.ctime,
            });
        });

        server.on("listening", () => {
            main_server_detail = server.address();
            main.webContents.send("server-detail", JSON.stringify({
                detail: main_server_detail,
                ip: main_server_detail.address,
                port: main_server_detail.port
            }));

            connection_dialog_signal.abort();
        });

        setTimeout(() => {
            server.listen(0, ipv4_inteface, () => console.log("Running smoothly"));
        }, 3000);

        e.returnValue = true;
    });

    ipc.on("stop-server", (e) => {
        io.close();
        server.close();

        io = null;
        server = null;
        expressapp = null;

        console.log(server);
        e.returnValue = true
    });
});

app.on("will-quit", async (e) => {
    if (history_saved === false) {
        e.preventDefault();

        await save_history_database_from_memory();
    }
    app.quit();
});


async function restore_history_database_from_file() {
    if (fs.existsSync(history_datastore_filepath)) {
        let _datastore;
        _datastore = datastore({ filename: history_datastore_filepath, autoload: true });
        await history_datastore.insert([...await _datastore.find({})]);
        await _datastore.remove({}, { multi: true });
    }
    return true;
}

async function save_history_database_from_memory() {
    let _datastore;
    _datastore = datastore({ filename: history_datastore_filepath, autoload: true });
    await _datastore.insert([...await history_datastore.cfind({}).projection({ _id: 0 }).exec()]);

    history_saved = true;
    return true;
}

function build_menu(connected) {
    const array = [];

    array.push({
        label: "Menu",
        submenu: [
            { label: "Se deconnecter", id: "disconnect", visible: connected, icon: path.join(__dirname, "layouts", "assets", "icons", "logout.png") },
            { label: "Envoyer", id: "send", visible: connected, click: draw_send_window, icon: path.join(__dirname, "layouts", "assets", "icons", "send.png") },
            { label: "Recevoir", id: "receive", visible: connected, click: draw_receive_window, icon: path.join(__dirname, "layouts", "assets", "icons", "receive.png") },
            { label: "Configuration", icon: path.join(__dirname, "layouts", "assets", "icons", "settings.png") },
            {
                label: "Développeur", submenu: [
                    { label: "Recharger", accelerator: "ctrl+r", role: "reload", icon: path.join(__dirname, "layouts", "assets", "icons", "reload.png") },
                    { label: "Ouvrir console du développeur", accelerator: "ctrl+shift+i", role: "toggleDevTools", icon: path.join(__dirname, "layouts", "assets", "icons", "console.png") }
                ], icon: path.join(__dirname, "layouts", "assets", "icons", "developer.png")
            },
            { label: "A propos", icon: path.join(__dirname, "layouts", "assets", "icons", "about.png") },
            { type: "separator" },
            { label: "Quitter", click: app.quit, accelerator: "alt+f4", icon: path.join(__dirname, "layouts", "assets", "icons", "quit.png") }
        ]
    });
    /*if (connected) {
        array.push({ label: "Envoyer", click: draw_send_window });
        array.push({ label: "Recevoir", click: draw_receive_window });
    }
    array.push({ label: "Configuration", click: draw_config_window });
    array.push({
        label: "Developpeur",
        submenu: [
            { label: "Recharger", accelerator: "ctrl+r", role: "reload" },
            { label: "Ouvrir console du développeur", accelerator: "ctrl+shift+i", role: "toggleDevTools" }
        ]
    });
    array.push({ label: "A propos" });*/

    return Menu.buildFromTemplate(array);
}

function draw_send_window() {
    main.close();
    //main = draw_window("Partage de fichier - Envoyer", max_window_width, max_window_width);
    main = draw_window("Partage de fichier - Envoyer", null, null);

    main.loadFile(path.join(__dirname, "layouts", "send - revisited.html"));
    main.setMenu(build_menu(true));
    main.show();
    main.maximize();
    main.webContents.on("did-finish-load", () => {
        !server ?
            main.webContents.send("server-start") :
            main.webContents.send("server-detail", JSON.stringify({
                detail: main_server_detail,
                ip: main_server_detail.address,
                port: main_server_detail.port
            }));

        main.webContents.send("user-detail", JSON.stringify({ ...user }));
    });
}

function draw_receive_window() {
    if (server) {
        main.close();
        main = draw_window("Partage de fichier - Envoyer");

        main.loadFile(path.join(__dirname, "layouts", "receive - revisited.html"));
        main.setMenu(build_menu(true));
        main.show();
        main.maximize();
        main.webContents.on("did-finish-load", () => {
            main.webContents.send("user-detail", JSON.stringify({ ...user }));
            main.webContents.send("server-detail", JSON.stringify({
                detail: main_server_detail,
                ip: main_server_detail.address,
                port: main_server_detail.port
            }));
        });
    }
    else {
        dialog.showMessageBox(main, {
            center: true,
            isAlwaysOnTop: true,
            message: "Votre serveur n'est pas démarré",
            detail: "Le serveur a été éteint ou n'a pas pu démarrer. Cliquer sur le bouton démarrer, afin de relancer le service, avant de proceder vers la fonctionnalité << Recevoir >>. Si par la suite le service n'est pas encore fonctionnel, veuillez contacter notre equipe de développement pour reporter le bug. Nous ferons notre maximum pour corriger le problème le plus vite possible.",
            title: "Avertissement",
            type: "warning"
        });
    }
}

function draw_config_window() {
    main.close();
    main = draw_window("Partage de fichier - Configuration", max_window_width, max_window_width);

    main.loadFile(path.join(__dirname, "layouts", "config.html"));
    main.setMenu(build_menu(user ? true : false));
    main.show();
}