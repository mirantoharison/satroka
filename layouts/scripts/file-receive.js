const _user_info_username = document.querySelector(".user-info-element.username");
const _user_info_avatar = document.querySelector(".user-info .avatar");
const _user_info_ip = document.querySelector(".user-info-element [name='address']");
const _user_info_port = document.querySelector(".user-info-element [name='port']");


const _path_container = document.querySelector(".path-container");
const _path_text = _path_container.querySelector(".path");
const _drive_list = _path_container.querySelector(".root");
const _parent_folder = _path_container.querySelector("button.parent");
const _choose_path_button = _path_container.querySelector("button.choose");

const _operation_container = document.querySelector(".operation-container");
const _sort_button = _operation_container.querySelector(".filter-button");
const _sort_button_up = _operation_container.querySelector(".sort-button.sort-up");
const _sort_button_down = _operation_container.querySelector(".sort-button.sort-down");
const _upload_start_button = _operation_container.querySelector(".start-upload");

const _search_text = _operation_container.querySelector(".search-text");
const _search_word_param = _operation_container.querySelector(".whole-text-mode");
const _search_folder_mode = _operation_container.querySelector(".folder-closure-mode");
const _page_container = _operation_container.querySelector(".page-current");
const _page_next_button = _operation_container.querySelector(".page-next");
const _page_previous_button = _operation_container.querySelector(".page-previous");
const _search_button = _operation_container.querySelector(".search-button");


const _server_ip_input = document.querySelector("[name='server-ip']");
const _server_port_input = document.querySelector("[name='server-port']");
const _server_connect_button = document.querySelector("[name='connect']");

const _file_item_container = document.querySelector(".download-item-container table tbody");
const _file_item_empty = _file_item_container.querySelector(".download-item.empty");

let _db;
let _socket;
let _user_info;

let _last_received_bytes;
let _search_state = false;
let _search_result_count;
let _is_search_result = false;
let _is_selected_result = false;

ipc.receivechannel("user-detail", (e, data) => {
    const user = { ...JSON.parse(data) };
    _user_info_username.textContent = user.username;
    _user_info_avatar.setAttribute("src", pathrd.join(".", "assets", "avatars", `${user.avatar}.png`));
    _user_info_avatar.dataset.source = user.avatar;
});

ipc.receivechannel("server-detail", (e, data) => {
    _user_info = { ...JSON.parse(data) };
    _user_info_ip.value = _user_info.ip;
    _user_info_port.value = _user_info.port;
});

ipc.receivechannel("progress-download", (e, data) => {
    update_file_item({ ...JSON.parse(data) });

    // to communicate progress data to server
    _socket.emit("progress", data);
});

ipc.receivechannel("progress-download-finish", (e, id) => {
    const _download_item = document.querySelector(`[data-id="${id}"]`);
    const _progress = _download_item.querySelector(".progress");
    _progress.style.opacity = 0;
    _progress.style.transform = "scaleY(0)";
});

ipc.receivechannel("detail-file-download", (e, data) => {
    create_file_item(clean_element(
        Object.assign(
            {},
            { file: true },
            { ...JSON.parse(data) })
    ));

    // to communicate dwonload file detail to server
    // these two _socket line are necessary to render progress for both the client and the server
    _socket.emit("process-detail", data);
});

ipc.receivechannel("path-changed", watch_path);

ipc.receivechannel("search-count-result-page", (e, data) => {
    // this is necessary to prevent the engine to reset the page value to 1 when restoring search from history
    if (data.restore === undefined) _page_container.value = 1;

    _page_container.setAttribute("max", parseInt(data["page"]));
});


_server_connect_button.addEventListener("click", connect_to_server);

_drive_list.addEventListener("click", explore_drive);
_parent_folder.addEventListener("click", explore_parent_folder);
_choose_path_button.addEventListener("click", choose_path);

_sort_button.addEventListener("click", filter_list);
_sort_button_up.addEventListener("click", () => { _sort_button_down.classList.remove("active"); _sort_button_up.classList.add("active"); });
_sort_button_down.addEventListener("click", () => { _sort_button_down.classList.add("active"); _sort_button_up.classList.remove("active"); });
_page_next_button.addEventListener("click", fetch_next_page_result);
_page_previous_button.addEventListener("click", fetch_previous_page_result);
_search_button.addEventListener("click", launch_search_list)


document.addEventListener("DOMContentLoaded", async () => {
    //localStorage.clear();

    _db = indexedDB.open("data", 1);
    //_db.result.transaction().objectStore().put()
    _db.onupgradeneeded = () => {
        const datastore = _db.result;
        if (!datastore.objectStoreNames.contains("configs")) datastore.createObjectStore("configs", { keyPath: "key" });
        console.log("IDB init")
    }
    _db.onsuccess = async () => {
        await explore_drive();
        await restore_path();
    }
});


async function explore_folder_content(_line, _save = true) {
    let _order_parameter = document.querySelector(".filter-parameter");
    let _order_value = document.querySelector(".sort-button.active");

    let _details;
    let _path = _line instanceof HTMLTableRowElement ? _line.dataset.path : _line;
    let _filter;

    let _now_history_button = document.querySelector("[data-search-label='now']");

    //render_status(`En cours de scan du dossier [${_path}] ...`);
    _filter = { path: _path, order_parameter: _order_parameter.options[_order_parameter.selectedIndex].value, order_value: _order_value.dataset.value };
    _details = ipc.sendSyncchannel("drive-explore", JSON.stringify(_filter));
    _details = await clean_list(_details);
    //render_status(`Terminé`);

    empty_files_container();
    draw_files(_details);
    _path_text.value = _path;

    // save last path
    localStorage.setItem("last-path", _path.toString());
    _is_search_result = false;
    _is_selected_result = false;

    document.querySelector(".browse-folder").scrollTo({ top: 0 });
    //_now_history_button.dispatchEvent(new Event("get-history"));
}

async function explore_drive() {
    //render_status("Chargement de la liste des disques ...");

    let _drives;
    _drives = ipc.sendSyncchannel("drive-list")
    _drives = _drives.map((_drive) => {
        let availableSize, totalSize;
        availableSize = _drive.availableSize ? Size.convertToOptimum({ size: _drive.availableSize, accuracy: 2 }) : null;
        availableSize = availableSize ? `${availableSize.value} ${availableSize.unit}` : null;
        totalSize = _drive.totalSize ? Size.convertToOptimum({ size: _drive.totalSize, accuracy: 2 }) : null;
        totalSize = totalSize ? `${totalSize.value} ${totalSize.unit}` : null;

        let driveicon;
        if (_drive.driveType === "CD-ROM") driveicon = "<img src='./assets/icons/cdrom.svg' class='element-icon'/>";
        else if (_drive.driveType === "2" && _drive.isUsb) driveicon = "<img src='./assets/icons/usbdrive.svg' class='element-icon'/>";
        else driveicon = "<img src='./assets/icons/drive.svg' class='element-icon'/>";

        return {
            checkbox: false,
            drive: true,
            icon: driveicon,
            name: `${_drive.name}`,
            path: `${_drive.path}`,
            total_size: totalSize,
            free_size: availableSize
        }
    });

    _path_text.value = null;
    draw_files(_drives);

    localStorage.removeItem("last-path");
}

async function explore_parent_folder() {
    let _path;

    _path = _path_text.value;
    _path = _path.split("\\");
    _path = _path.slice(0, _path.length - 2);

    _path.length > 0 ?
        explore_folder_content(`${_path.join("\\")}\\`) :
        explore_drive();
}

async function explore_all_files(_section, _last_path) {
    if (section_handler_boilerplate(_section)) {
        _path_text.value = localStorage.getItem("last-path");
        _parent_folder.removeAttribute("disabled");

        _last_path && typeof (_last_path) === "string" ?
            explore_folder_content(_last_path) :
            explore_drive();
    }
}

function choose_path() {
    const _choose = ipc.sendSyncchannel("choose-path-destination", _path_text.value.trim());
    const _state = ipc.sendSyncchannel("check-own-ready-state");

    // we are only emit this to the server when we are ready
    _socket?.emit("ready");
    _socket?.emit("check-ready-state", _state);

    const _transaction = _db.result.transaction("configs", "readwrite");
    const _datastore = _transaction.objectStore("configs");
    const _path = _datastore.get("PATHKEY");
    const _data = { "key": "PATHKEY", "download-destination-path": _path_text.value.trim() };
    _path.addEventListener("success", () => {
        _path.result === undefined ?
            _datastore.add({ ..._data }) :
            _datastore.put({ ..._data });
        //render_status();
    });
}

function watch_path() {
    explore_folder_content(_path_text.value.trim());
}

function restore_path() {
    const _transaction = _db.result.transaction("configs", "readwrite");
    const _datastore = _transaction.objectStore("configs");
    const _path = _datastore.get("PATHKEY")
    _path.addEventListener("success", () => {
        if (_path.result) {
            explore_folder_content(_path.result["download-destination-path"]);
            //choose_path(_path.result["download-destination-path"]);
        }
        //render_status();
    });
}


async function empty_files_container() {
    const _line_container = document.querySelector(".browse-folder table tbody");
    const _line_not_empty = _line_container.querySelectorAll(".folder-item:not(.empty)");

    for (const _line of _line_not_empty) _line.remove();
}

async function draw_files(data, reset_list = true) {
    const _line_container = document.querySelector(".browse-folder table tbody");
    const _line_not_empty = _line_container.querySelectorAll(".folder-item:not(.empty)");
    const _line_empty = _line_container.querySelector(".empty");

    for (const _line of _line_not_empty) if (reset_list) await _line.remove();
    for (const _line of data) create_file_line(_line);

    data.length > 0 ?
        _line_empty.classList.add("not-empty") :
        _line_empty.classList.remove("not-empty");
}

async function create_file_line(data) {
    const _line_container = document.querySelector(".browse-folder table tbody");
    const _line = document.createElement("tr");
    const _test_path_selected = data.path && data.file ? await test_path(data.path) : false;

    _line.innerHTML = `
        <td class="icon">${data.icon}</td>
        <td class="name">${data.name ? data.name : "Elément inconnu"}</td>
        <td class="path">${data.path ? data.path : ""}</td>
    `;

    // rendrering additionnal data depending on element type
    if (data.drive) {
        _line.innerHTML += `
            <td class="size">${data.free_size ? data.free_size : ""}</td>
            <td class="size">${data.total_size ? data.total_size : ""}</td>
            <td class="expand"></td>
        `;
    }
    else {
        _line.innerHTML += `
            <td class="size">${data.rendersize ? data.rendersize : ""}</td>
            <td class="date">${data.mtime ? `${new Date(data.mtime).toLocaleDateString("fr")} ${new Date(data.mtime).toLocaleTimeString("fr")}` : ""}</td>
            <td class="date">${data.ctime ? `${new Date(data.ctime).toLocaleDateString("fr")} ${new Date(data.ctime).toLocaleTimeString("fr")}` : ""}</td>
        `;
    }


    _line.classList.add("folder-item");
    await _line_container.appendChild(_line);
    _line.dataset.path = `${data.path}${String(data.path).endsWith("\\") ? "" : "\\"}`;

    // add eplore features for folder
    if (data.folder || data.drive) _line.querySelector("td.name").addEventListener("click", () => {
        explore_folder_content(_line);
    });
    else if (data.file) {
        _line.querySelector("td.name").addEventListener("click", () => {
            _line.querySelector("td input[type='checkbox']").click();
        });

        _line.querySelector("td input[type='checkbox']")?.addEventListener("change", () => {
            _line.querySelector("td input[type='checkbox']").checked ?
                add_file(_line) :
                remove_file(_line);
        });

        _line.querySelector("td.remove button")?.addEventListener("click", async () => {
            await remove_file(_line);
            _line.remove();

            const _line_container = document.querySelector(".list-container table tbody");
            const _line_not_empty = _line_container.querySelectorAll(".upload-item:not(.empty)");
            const _line_empty = _line_container.querySelector(".empty");

            _line_not_empty.length > 0 ?
                _line_empty.classList.add("not-empty") :
                _line_empty.classList.remove("not-empty");
        });
    }
}

async function test_path(path) {
    return ipc.sendSyncchannel("test-path", path);
}


function connect_to_server() {
    const _socket_url = `http://${_server_ip_input.value}:${_server_port_input.value}`;

    try {
        _socket = io(_socket_url);

        _socket.on("connect_error", (err) => disconnect_from_server);
        _socket.on("connect", () => {
            _server_connect_button.textContent = "Se deconnecter";
            _server_connect_button.classList.add("disconnect");
        });
        _socket.on("disconnect", () => {
            _server_connect_button.textContent = "Se connecter";
            _server_connect_button.classList.remove("disconnect");
            disconnect_from_server();
        });
        _socket.on("start-download", (data) => { console.log(data); ipc.sendchannel("start-download", data) });
        _socket.on("cancel-download", () => ipc.sendchannel("cancel-download"));
        _socket.on("check-ready-state", () => {
            const _state = ipc.sendSyncchannel("check-own-ready-state");
            _socket.emit("check-ready-state", _state);
        });

        _socket.emit("socket-detail", JSON.stringify({
            ip: _user_info.ip,
            port: _user_info.port,
            name: _user_info_username.textContent,
            avatar: _user_info_avatar.dataset.source,
        }));
    }
    catch (err) {
        console.error(err);
    }

    _server_connect_button.removeEventListener("click", connect_to_server);
    _server_connect_button.addEventListener("click", disconnect_from_server);
}

function disconnect_from_server() {
    _socket.disconnect();
    _socket.close();

    _server_connect_button.removeEventListener("click", connect_to_server);
    _server_connect_button.removeEventListener("click", disconnect_from_server);
    _server_connect_button.addEventListener("click", connect_to_server);
}

function create_file_item(data) {
    let _file_item = document.createElement("tr");
    let _file_ext = convert_file_to_icon(data.ext);

    //_file_item_empty.classList.add("not-empty");
    _file_item.innerHTML = `
        <td class="remove"><button><i class="fa fa-times"></i></button></td>
        <td class="action">
            <button><i class="fa fa-pause"></i></button>
            <button><i class="fa fa-stop"></i></button>
        </td>
        <td class="icon">${data.icon}</td >
        <td class="name"><span>${data.name}</span></td>
        <td class="percent"><span>---</span></td>
        <td class="progress">
            <div class="progress-all">
                <div class="progress-done"></div>
            </div>
        </td>
        <td class="size transferred"><span>---</span></td>
        <td class="size total"><span>${data.sizestring}</span></td>
    `;
    _file_item.classList.add("download-item");
    _file_item_container.appendChild(_file_item);
    _file_item.dataset.id = data._id;
    _file_item.dataset.name = data.name;
    _file_item.querySelector(".name").setAttribute("title", data.name);

    /*setTimeout(() => {
        _file_item.style.opacity = 1;
        _file_item.style.transform = "translateY(0)";
    }, 10);*/
}

function update_file_item(data) {
    const _file_item = document.querySelector(`[data-id= '${data._id}']`);

    const _transferred = _file_item.querySelector(".size.transferred span");
    const _percentage = _file_item.querySelector(".percent span");
    //const _rate = _file_item.querySelector(".rate");
    const _bar = _file_item.querySelector(".progress .progress-done");

    let _rate_calulate;
    if (!_last_received_bytes) _last_received_bytes = 0;
    _rate_calulate = data.transferred - _last_received_bytes;
    _rate_calulate = Size.convertToOptimum({ size: _rate_calulate > 0 ? _rate_calulate : _last_received_bytes, accuracy: 3 });
    _rate_calulate = `${_rate_calulate.value}${_rate_calulate.unit} `;

    _last_received_bytes = data.transferred;

    _transferred.textContent = data.transferredstring;
    _percentage.textContent = `${Math.ceil(data.percent * 100)}% `;
    //_rate.textContent = _rate_calulate;
    _bar.style.width = `${Math.ceil(data.percent * 100)}% `;
}


function filter_list() {
    if (_is_search_result) _search_button.dispatchEvent(new Event("click"));
    else if (_is_selected_result) get_selected_list();
    else explore_folder_content(_path_text.value, false);
}

async function get_selected_list() {
    let _selected_list;
    let _filter;
    let _order_parameter = document.querySelector(".filter-parameter");
    let _order_value = document.querySelector(".sort-button.active");

    _is_selected_result = true;
    _is_search_result = false;

    _path_text.value = "Liste des fichiers séléctionnés ...";
    _parent_folder.setAttribute("disabled", true);

    render_status(`En cours de chargement de la liste ...`);
    _filter = { order_parameter: _order_parameter.options[_order_parameter.selectedIndex].value, order_value: _order_value.dataset.value };

    _selected_list = ipc.sendSyncchannel("get-list", JSON.stringify(_filter));
    _selected_list = await clean_list(_selected_list);
    _selected_list = _selected_list.map((_file) => {
        _file.delete = true;
        return _file;
    });

    draw_files(_selected_list);
    render_status(`Terminé`);
}

function build_search_parameter() {
    let _order_parameter = document.querySelector(".filter-parameter");
    let _order_value = document.querySelector(".sort-button.active");
    let _search_parameter = {
        name: _search_text.value.trim(),
        page: _page_container.value !== "" ? _page_container.value : 1,
        sortColumn: _order_parameter.options[_order_parameter.selectedIndex].value,
        sortOrder: _order_value.getAttribute("data-value"),
        directoryOnly: true,
    };

    return _search_parameter;
}

async function launch_search_list() {
    await search_list(build_search_parameter());
}

function search_list(_search_parameter, save = true) {
    let search_append_handler = (e, data) => {
        let _list;
        let _list_length;
        _list = data && data.name ? clean_list([data]) : [];
        _list_length = _list.length;

        draw_files(_list, !_search_state);
        _search_state = true;
        _search_result_count += _list_length;

        //render_status(`Recherche en cours ... - ${ _search_result_count } élément(s) trouvé(s)`);
    }
    let search_end_handler = () => {
        _search_state = false;
        _search_force_abort = null;
        ipc.receiveAllcancel("search-append-result");
        ipc.receiveAllcancel("search-result-end");

        //render_status(`Recherche finie - ${ _search_result_count } élément(s) trouvé(s)`);

        if (_search_result_count === 0) draw_files([]);

        cancel_search_list(false);
    }

    _search_result_count = 0;
    _is_search_result = true;
    _is_selected_result = false;

    ipc.sendchannel("drive-search", build_search_parameter());
    ipc.receivechannel("search-append-result", search_append_handler);
    ipc.receivechannel("search-result-end", search_end_handler);
    //render_status("Rechercher en cours ...");

    //section_handler_boilerplate(_all_section);

    _search_button.removeEventListener("click", launch_search_list);
    _search_button.addEventListener("click", cancel_search_list);
    _search_button.innerHTML = "<i class='fa fa-times'></i>";

    _path_text.value = `Resultat de recherche pour < ${_search_parameter.name.trim()}> ...`;

    //if (save) save_history(Object.assign({}, { type: "search" }, { ..._search_parameter }));
}

function cancel_search_list(status = true) {
    _search_button.removeEventListener("click", cancel_search_list);
    _search_button.addEventListener("click", launch_search_list);
    _search_button.innerHTML = "<i class='fa fa-search'></i>";

    ipc.sendSyncchannel("search-cancel");
    ipc.receiveAllcancel("search-append-result");
    ipc.receiveAllcancel("search-result-end");
    _search_state = false;

    if (status) render_status(`Recherche annulée - ${_search_result_count} élément(s) affiché(s)`);
}

async function fetch_next_page_result() {
    const _max_page = _page_container.getAttribute("max");
    if (
        _search_text.value &&
        Number(_page_container.value) < Number(_max_page)
    ) {
        await cancel_search_list(false);

        _page_container.value = Number(_page_container.value) + 1;
        _search_button.dispatchEvent(new Event("click"));
    }
}

async function fetch_previous_page_result() {
    if (
        _search_text.value &&
        Number(_page_container.value) > 1
    ) {
        await cancel_search_list(false);

        _page_container.value = Number(_page_container.value) - 1;
        _search_button.dispatchEvent(new Event("click"));
    }
}


function check_file_ext(ext) {
    let _file_type;
    _file_type = fsrd.readFileSync("./layouts/scripts/file_extension.json", { encoding: "utf-8" });
    _file_type = JSON.parse(_file_type);

    for (const _type of Object.keys(_file_type)) {
        if (_file_type[_type].includes(ext)) return _type;
    }
}

function clean_element(_element) {
    let _icon;
    let _size = _element.size && _element.size !== "0" ? Size.convertToOptimum({ size: _element.size, accuracy: 2 }) : null;

    if (_element.ext === undefined) {
        _element.ext = pathrd.extname(_element.path);
        _element.ext = _element.ext.split(".").pop();
    }

    // render icon depending of element type
    if (_size) _element.rendersize = `${_size.value}${_size.unit} `;
    if (_element.system) _icon = "<img src='../layouts/assets/icons/folder.svg' class='folder'/>";
    else if (_element.folder) _icon = "<img src='../layouts/assets/icons/folder.svg' class='folder'/>";
    else _icon = "<img src='../layouts/assets/icons/foldererr.svg' class='folder'/>";

    // render icon depending of extension if file
    if (_element.file) {
        let _t;
        _t = check_file_ext(_element.ext.toLowerCase());
        if (_t) _icon = `<img src='../layouts/assets/icons/${_t}.svg' class='file' />`;
    }

    return Object.assign({},
        {
            checkbox: _element.file ? true : false,
            icon: _icon
        },
        { ..._element }
    );
}

function clean_list(list) {
    return list.map((element) => clean_element(element));
}