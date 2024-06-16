const _user_info_username = document.querySelector(".user-info .user-info-element.username");
const _user_info_avatar = document.querySelector(".user-info .avatar");
const _user_info_ip = document.querySelector(".user-info-element [name='address']");
const _user_info_port = document.querySelector(".user-info-element [name='port']");

const _path_container = document.querySelector(".path-container");
const _path_text = _path_container.querySelector(".path");
const _drive_list = _path_container.querySelector(".root");
const _parent_folder = _path_container.querySelector("button.parent");


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

const _section_type_container = document.querySelector(".file-types-container");
const _selected_section = _section_type_container.querySelector(".selection");
const _all_section = _section_type_container.querySelector(".all");


const _file_count_container = document.querySelector(".upload-detail-element .count");
const _file_size_container = document.querySelector(".upload-detail-element .size");
const _upload_control = document.querySelector(".upload-control")


const _upload_container = document.querySelector(".upload-item-container");

const _start_server_button = document.querySelector(".user-info-container .start-server");
//const _upload_start_button = document.querySelector(".upload-start-button");


const _history = document.querySelector(".history .history-list");
const _history_group = _history.querySelectorAll(".history-group");
const _history_group_button = _history.querySelectorAll(".history-group .history-group-label .toggle-button");


let _status_timeout;
let _status_timeout_time = 3000;
let _search_state = false;
let _search_result_count;
let _is_search_result = false;
let _is_selected_result = false;
let _file_type;

let _search_force_abort;


ipc.receivechannel("user-detail", (e, data) => {
    const user = { ...JSON.parse(data) };
    _user_info_username.textContent = user.username;
    _user_info_avatar.setAttribute("src", pathrd.join(".", "assets", "avatars", `${user.avatar}.png`));
});

ipc.receivechannel("server-detail", (e, data) => {
    const _user_info = { ...JSON.parse(data) };
    _user_info_ip.value = _user_info.ip;
    _user_info_port.value = _user_info.port;

    update_start_server_button_state(_start_server_button);
});

ipc.receivechannel("saved-list", (e, data) => {
    const _list_data = { ...JSON.parse(data) };

    if (_list_data.count) {
        _list_data.size = Size.convertToOptimum({ size: _list_data.size, accuracy: 2 });
        _file_count_container.textContent = _list_data.count;
        _file_size_container.textContent = `${_list_data.size.value} ${_list_data.size.unit}`;
    }
});

// this also should be moved to receiving script
ipc.receivechannel("user-connected", (e, data) => {
    const _user_connected = { ...JSON.parse(data) };
    create_user_line(_user_connected);
});

ipc.receivechannel("user-disconnected", (e, data) => {
    const _user_disconnected = { ...JSON.parse(data) };
    const _user_id = _user_disconnected.socketid;
    const _user_line = document.querySelector(`[data-socketid='${_user_id}']`);

    _user_line.style.opacity = 0;
    _user_line.style.transform = "translateY(5px)";
    setTimeout(() => {
        if (_user_line) _user_line.remove();
    }, 120);
});

ipc.receivechannel("user-ready-state", (e, socketid, state) => {
    const _user_item = document.querySelector(`[data-socketid="${socketid}"]`);
    const _user_state = state;

    console.log(_user_state);
    if (_user_item && _user_state) change_user_status(_user_item, "ready", "Prêt");
});


ipc.receivechannel("server-start", () => _start_server_button.dispatchEvent(new Event("click")));
ipc.receivechannel("user-process-detail", (e, data) => {
    console.log(JSON.parse(data));
});

ipc.receivechannel("path-changed", watch_path);

ipc.receivechannel("search-count-result-page", (e, data) => {
    // this is necessary to prevent the engine to reset the page value to 1 when restoring search from history
    if (data.restore === undefined) _page_container.value = 1;

    _page_container.setAttribute("max", parseInt(data["page"]));
});

let _wait_point = ".";
let _wait_reset;
ipc.receivechannel("progress", (e, data) => {
    const _progress = JSON.parse(data);
    const _user_item_id = `[data-socketid="${_progress.socketid}"]`;
    const _user_item = document.querySelector(_user_item_id);

    const _file = _user_item.querySelector(".transfert-file");
    const _file_icon = _user_item.querySelector(".transfert-file-icon");
    const _progress_bar = _user_item.querySelector(".transfert .progress .progress-done");

    const _percent = _progress.percent * 100;
    const _extension = _progress.name
        .split(".")
        .pop()
        .toLowerCase();
    _progress_bar.style.width = _percent + "%";

    _file.textContent = _progress.name;
    _file_icon.src = `./assets/icons/${check_file_ext(_extension)}.svg`;

    if (_percent !== 100) {
        if (_wait_reset) clearTimeout(_wait_reset);

        change_user_status(_user_item, "on-going", "Transfert en cours " + _wait_point);
        _wait_point.length < 3 ? _wait_point += "." : _wait_point = ".";
    }
    else {
        _wait_reset = setTimeout(() => {
            change_user_status(_user_item, "ready", "Prêt");
        }, 500);
    }
});


_drive_list.addEventListener("click", explore_drive);
_parent_folder.addEventListener("click", explore_parent_folder);


_start_server_button.addEventListener("click", () => start_or_kill_server(_start_server_button));
_sort_button.addEventListener("click", filter_list);
_sort_button_up.addEventListener("click", () => { _sort_button_down.classList.remove("active"); _sort_button_up.classList.add("active"); });
_sort_button_down.addEventListener("click", () => { _sort_button_down.classList.add("active"); _sort_button_up.classList.remove("active"); });
_page_next_button.addEventListener("click", fetch_next_page_result);
_page_previous_button.addEventListener("click", fetch_previous_page_result);
_search_button.addEventListener("click", launch_search_list);
_upload_start_button.addEventListener("click", start_upload);


_all_section.addEventListener("click", () => explore_all_files(_all_section, localStorage.getItem("last-path")));
_selected_section.addEventListener("click", () => explore_selected_files(_selected_section));

for (const _button of _history_group_button) {
    _button.addEventListener("click", () => history_button_handler(_button));
    _button.addEventListener("get-history", () => {
        const _history_group = _button.parentElement.parentElement;
        const _history_group_list = _history_group.querySelector(".history-group-list");

        _history_group_list.innerHTML = null;

        if (_button.classList.contains("extended")) get_history_data(_button, _button.getAttribute("data-search-label"))
    });
}


document.addEventListener("DOMContentLoaded", async () => {
    setTimeout(async () => await explore_drive(), 3000);
    localStorage.clear();
});

/*async function create_file_line(data) {
    const _line_container = document.querySelector(".upload-item-container");
    const _line_empty = _line_container.querySelector(".empty");
    const _line = document.createElement("div");

    const _line_deletion = (button, line_id) => {
        ipc.sendSyncchannel("delete-list", line_id);
        button.parentElement.remove();

        _line_container.querySelectorAll(".upload-item").length === 1 ?
            _line_empty.classList.remove("not-empty") :
            _line_empty.classList.add("not-empty");

        if (_line_container.querySelectorAll(".upload-item").length === 1) {
            _file_count_container.textContent = "---";
            _file_size_container.textContent = "---";
        }
    }

    _line.innerHTML = `
        <div class="icon-wrapper">
            <img src="${data.icon}" alt="${data.name}" />
        </div>
        <span class="name">${data.name}</span>
        <span class="size">${data.size}</span>
        <button><i class="fa fa-times"></i><span>Enlever</span></button>
    `;

    _line.classList.add("upload-item");
    await _line_container.appendChild(_line);
    _line.querySelector("button").addEventListener("click", (e) => _line_deletion(_line.querySelector("button"), data.id));
    _line_empty.classList.add("not-empty");
}*/

async function explore_folder_content(_line, _save = true) {
    let _order_parameter = document.querySelector(".filter-parameter");
    let _order_value = document.querySelector(".sort-button.active");

    let _details;
    let _path = _line instanceof HTMLTableRowElement ? _line.dataset.path : _line;
    let _filter;

    let _now_history_button = document.querySelector("[data-search-label='now']");

    render_status(`En cours de scan du dossier [${_path}] ...`);
    _filter = { path: _path, order_parameter: _order_parameter.options[_order_parameter.selectedIndex].value, order_value: _order_value.dataset.value };

    _details = ipc.sendSyncchannel("drive-explore", JSON.stringify(_filter));
    _details = await clean_list(_details);
    render_status(`Terminé`);

    draw_files(_details);
    if (_save) save_history({ type: "explore", path: _path });
    _path_text.value = _path;

    // save last path
    localStorage.setItem("last-path", _path.toString());
    _is_search_result = false;
    _is_selected_result = false;

    _now_history_button.dispatchEvent(new Event("get-history"));
    document.querySelector(".list-container").scrollTo({ top: 0 });
}

async function explore_drive() {
    _all_section.dispatchEvent(new Event("click"));

    render_status("Chargement de la liste des disques ...");

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

async function explore_selected_files(_section) {
    if (section_handler_boilerplate(_section)) get_selected_list();
}

function watch_path() {
    explore_folder_content(_path_text.value.trim());
}



async function save_history(_history_data) {
    if (_history_data) {
        console.log(_history_data);
        ipc.sendchannel("save-history", _history_data);
    }
}

function history_button_handler(button) {
    extend_history_group(button, () => button.classList.contains("extended") ? get_history_data(button, button.getAttribute("data-search-label")) : null);
}

function extend_history_group(button, cb = () => { }) {
    const _extended_button = _history.querySelector(".history-group .history-group-label .toggle-button.extended");

    if (_extended_button && _extended_button !== button) close_current_history_group(_extended_button);

    const _history_group_button = button;
    const _history_group = _history_group_button.parentElement.parentElement;
    const _history_group_list = _history_group.querySelector(".history-group-list");
    _history_group_list.classList.toggle("show");
    _history_group_list.innerHTML = null;
    _history_group_button.classList.toggle("extended");

    if (cb && typeof cb === "function") cb();
}

function close_current_history_group(_button) {
    const _history_group = _button.parentElement.parentElement;
    const _history_group_list = _history_group.querySelector(".history-group-list");
    _history_group_list.classList.toggle("show");
    _button.classList.toggle("extended");
}

function get_history_data(button, params) {
    const _data = ipc.sendSyncchannel("get-history", { search_date_type: params });
    const _history_container = button.parentElement.parentElement.querySelector(".history-group-list");
    for (const _history of _data) create_history_line(
        _history,
        _history_container
    );
}

async function create_history_line(data, container) {
    const _line = document.createElement("div");
    const _date = new Date(data.date);
    const _hour = _date.getHours() < 10 ? "0" + _date.getHours() : _date.getHours();
    const _minute = _date.getMinutes() < 10 ? "0" + _date.getMinutes() : _date.getMinutes();

    if (data.type === "transfert") data.type = "user";

    if (
        data.type !== "explore" ||
        data.type === "explore" && data.name
    ) {
        _line.innerHTML = `
                <div class="remove"><button><i class="fa fa-times"></i></button></div>
                <div class="icon"><img class="search" src="./assets/icons/${data.type}.svg" /></div>
                <div class="name"><span>${data.name}</span>
                </div>
                <div class="date">${_hour}:${_minute}</div>
            `;

        _line.classList.add("history-item");
        _line.querySelector(".remove").addEventListener("click", () => null);

        if (data.type === "explore") {
            _line.setAttribute("title", data.path);
            _line.querySelector(".name span").addEventListener("click", () => explore_folder_content(data.path, false));
        }
        else if (data.type === "search") {
            const _search_parameter = { ...data };

            delete _search_parameter.type;
            delete _search_parameter.path;
            delete _search_parameter.date;
            delete _search_parameter.noday;
            delete _search_parameter.noweek;
            delete _search_parameter.nomonth;
            delete _search_parameter.noyear;

            _line.setAttribute("title", `Recherche de <${data.name} : page - ${data.page} : filtre - ${data.sortColumn}>`);
            _line.querySelector(".name span").addEventListener("click", () => restore_search_list({ ..._search_parameter }));
        }

        await container.appendChild(_line);
        _line.dataset.path = data.path;
    }
}

/*async function restore_explore_from_history(direction = { previous: false, next: false }) {
    let _history = JSON.parse(localStorage.getItem("folder-history"));
    let _history_index = localStorage.getItem("folder-history-index");
    if (
        _history_index !== undefined &&
        _history_index !== null
    )
        _history_index = parseInt(localStorage.getItem("folder-history-index"));
    else _history_index = _history.length;
 
    if (_history_index > 0 && direction.previous) _history_index = _history_index - 1;
    else if (_history_index < _history.length - 1 && direction.next) _history_index = _history_index + 1;
 
    localStorage.setItem("folder-history-index", _history_index);
 
    explore_folder_content(_history[_history_index], false);
}*/



async function draw_files(data, reset_list = true) {
    const _line_container = document.querySelector(".list-container table tbody");
    const _line_not_empty = _line_container.querySelectorAll(".upload-item:not(.empty)");
    const _line_empty = _line_container.querySelector(".empty");

    for (const _line of _line_not_empty) if (reset_list) await _line.remove();
    for (const _line of data) create_file_line(_line);

    data.length > 0 ?
        _line_empty.classList.add("not-empty") :
        _line_empty.classList.remove("not-empty");
}

async function create_file_line(data) {
    const _line_container = document.querySelector(".list-container table tbody");
    const _line = document.createElement("tr");
    const _test_path_selected = data.path && data.file ? await test_path(data.path) : false;

    _line.innerHTML = `
        ${data.delete ?
            `<td class="remove"><button type="button"><i class="fa fa-times"></i></button></td>` :
            `<td><input type="checkbox" ${_test_path_selected ? "checked" : ""}/></td>`
        }
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


    _line.classList.add("upload-item");
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

async function add_file(_file) {
    let _file_temp = _file;
    let _file_path = _file_temp instanceof HTMLTableRowElement ? _file_temp.dataset.path : _file_temp;

    ipc.sendSyncchannel("save-list", { path: _file_path });
}

async function remove_file(_file) {
    let _file_temp = _file;
    let _file_path = _file_temp instanceof HTMLTableRowElement ? _file_temp.dataset.path : _file_temp;

    ipc.sendSyncchannel("delete-list", { path: _file_path });
}
/*async function add_file(_file) {
    let _file_list = [...JSON.parse(ipc.sendSyncchannel("browse-files", null)).files];
    let _files = _file_list.map((file) => {
        let _file_id;
        let _file_detail = fsrd.statSync(file);
        let _file_ext = pathrd.extname(file).slice(1);
        let _file_name = pathrd.basename(file);
        let _file_size = Size.convertToOptimum({ size: _file_detail.size, accuracy: 2 });
 
        _file_ext = convert_file_to_icon(_file_ext);
 
        _file_id = ipc.sendSyncchannel("save-list", JSON.stringify({
            files: Object.assign(
                {},
                { ..._file_detail },
                {
                    fileid: _file_id,
                    name: _file_name,
                    path: file,
                })
        }));
 
        if (_file_id) {
            return {
                id: _file_id,
                name: _file_name,
                path: file,
                icon: pathrd.join(".", "assets", "files", `${_file_ext}.png`),
                ext: _file_ext,
                size: `${_file_size.value} ${_file_size.unit}`,
            }
        }
        else return null;
    });
 
    _files = _files.filter((value) => value !== null);
 
    for (const _file of _files) await create_file_line(_file);
}*/

async function create_user_line(data) {
    const _user_line_container = document.querySelector(".upload-section .address");
    const _user_line = document.createElement("div");

    _user_line.innerHTML = ` 
        <div class="avatar">
            <img src="${pathrd.join(".", "assets", "avatars", `${data.avatar}.png`)}"  />
        </div>
        <span class="address">${data.ip}:${data.port}</span>
        <span class="name">${data.name}</span>
        <div class="status">
            <div class="status-circle"></div>
            <span class="status-text"></span>
        </div>
        <div class="transfert">
            <div class="file">
                <img class="transfert-file-icon" src="./assets/icons/wait.svg" />
                <span class="transfert-file"></span>
            </div>
            <div class="progress">
                <div class="progress-done"></div>
            </div>
        </div>
    `;
    _user_line.classList.add("upload-user-share");
    _user_line_container.appendChild(_user_line);
    _user_line.dataset.socketid = data.socketid;
    _user_line.dataset.ip = data.ip;
    _user_line.dataset.port = data.port;

    change_user_status(_user_line, "connected", "Connecté");

    setTimeout(() => {
        _user_line.style.opacity = 1;
        _user_line.style.transform = "translateY(0)";
    }, 10);

    setTimeout(() => {
        ipc.sendchannel("check-ready-state", data.socketid);
    }, 1000);
}

function change_user_status(useritem, status, statustext) {
    const _status = useritem.querySelector(".status");
    const _status_circle = _status.querySelector(".status-circle");
    const _status_text = _status.querySelector(".status-text");

    const _status_array = ["connected", "ready", "busy", "on-going"];
    for (const _status_text of _status_array) {
        status === _status_text ?
            _status_circle.classList.add(_status_text) :
            _status_circle.classList.remove(_status_text);
    }
    _status_text.textContent = statustext;
}

function section_handler_boilerplate(_section) {
    const _selected_section = _section_type_container.querySelector(".selected");
    if (_section !== _selected_section) {
        _selected_section.classList.remove("selected");
        _section.classList.add("selected");
        return true;
    }
    return false;
}


function test(params = {}) {
    ipc.sendchannel("test");
    //ipc.sendchannel("save-history", { type: "transfert" })
    //console.log(ipc.sendSyncchannel("get-history", params));
}


function render_status(text) {
    const _status_container = document.querySelector(".status-container");
    const _status_text = _status_container.querySelector(".status-text");
    const _status_icon = _status_container.querySelector(".status-icon");

    clearTimeout(_status_timeout);
    _status_text.innerHTML = text;
    _status_timeout = setTimeout(() => {
        _status_text.innerHTML = "En attente d'autres opérations ...";
    }, _status_timeout_time);
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
        directoryClosure: _search_folder_mode.checked,
        directoryToSearch: localStorage.getItem("last-path"),
        matchWord: _search_word_param.checked,
    };

    return _search_parameter;
}

async function launch_search_list() {
    await search_list(build_search_parameter());
}

async function restore_search_list(params) {
    const _params = { ...params };

    if (
        _search_force_abort &&
        _search_force_abort instanceof AbortController
    ) _search_force_abort.abort();

    _search_force_abort = new AbortController();
    _search_force_abort.signal.addEventListener("abort", () => cancel_search_list());
    _search_text.value = _params.name.trim();
    _page_container.value = parseInt(_params.page);

    if (_params.directoryClosure) _search_folder_mode.setAttribute("checked", true);
    if (_params.matchWord) _search_word_param.setAttribute("checked", true);
    if (_params.directoryToSearch) localStorage.setItem("last-path", _params.directoryToSearch);

    search_list(Object.assign(
        {},
        { ...params },
        { restore: true }
    ), false);
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

        render_status(`Recherche en cours ... - ${_search_result_count} élément(s) trouvé(s)`);
    }
    let search_end_handler = () => {
        _search_state = false;
        _search_force_abort = null;
        ipc.receiveAllcancel("search-append-result");
        ipc.receiveAllcancel("search-result-end");

        render_status(`Recherche finie - ${_search_result_count} élément(s) trouvé(s)`);

        if (_search_result_count === 0) draw_files([]);

        cancel_search_list(false);
    }

    _search_result_count = 0;
    _is_search_result = true;
    _is_selected_result = false;

    ipc.sendchannel("drive-search", build_search_parameter());
    ipc.receivechannel("search-append-result", search_append_handler);
    ipc.receivechannel("search-result-end", search_end_handler);
    render_status("Rechercher en cours ...");

    section_handler_boilerplate(_all_section);

    _search_button.removeEventListener("click", launch_search_list);
    _search_button.addEventListener("click", cancel_search_list);
    _search_button.innerHTML = "<i class='fa fa-times'></i>";

    _path_text.value = `Resultat de recherche pour <${_search_parameter.name.trim()}> ...`;

    if (save) save_history(Object.assign({}, { type: "search" }, { ..._search_parameter }));
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

    _element.ext = pathrd.extname(_element.path);
    _element.ext = _element.ext.split(".").pop();

    // render icon depending of element type
    if (_size) _element.rendersize = `${_size.value}${_size.unit}`;
    if (_element.system) _icon = "<img src='../layouts/assets/icons/folder.svg' class='folder'/>";
    else if (_element.folder) _icon = "<img src='../layouts/assets/icons/folder.svg' class='folder'/>";
    else _icon = "<img src='../layouts/assets/icons/foldererr.svg' class='folder'/>";

    // render icon depending of extension if file
    if (_element.file) {
        let _t;
        _t = check_file_ext(_element.ext.toLowerCase());
        if (_t) _icon = `<img src='../layouts/assets/icons/${_t}.svg' class='file'/>`;
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


function start_upload() {
    const _start_result = ipc.sendSyncchannel("start-upload");

    if (_start_result) {
        update_start_upload_state();

        _upload_start_button.removeEventListener("click", start_upload);
        _upload_start_button.addEventListener("click", cancel_upload);
    }
}

function cancel_upload() {
    ipc.sendSyncchannel("cancel-upload");

    update_start_upload_state();

    _upload_start_button.removeEventListener("click", cancel_upload);
    _upload_start_button.addEventListener("click", start_upload);
}

function update_start_upload_state() {
    const _line_container = document.querySelector(".list-container table tbody");

    _upload_start_button.classList.toggle("start");

    if (_upload_start_button.classList.contains("start")) {
        _upload_start_button.innerHTML = `<i class="fa fa-stop"></i><span>Arrêter</span>`;
        _line_container.style.pointerEvents = "none";
        // add cancel upload logics here
    }
    else {
        _upload_start_button.innerHTML = `<i class="fa fa-play"></i><span>Téléverser</span>`;
        _line_container.style.pointerEvents = "all";
    }
}


function reset_list() {
    ipc.sendSyncchannel("reset-list");

    const _line_container = document.querySelector(".upload-item-container");
    const _line_empty = _line_container.querySelector(".empty");
    const _line = _line_container.querySelectorAll(".upload-item:not(.empty)");

    _line.forEach((_file_line) => _file_line.remove());
    _line_empty.classList.remove("not-empty");
    _file_count_container.textContent = "---";
    _file_size_container.textContent = "---";
}

function start_or_kill_server(button) {
    if (button.classList.contains("disconnect")) {
        ipc.sendSyncchannel("stop-server");

        _user_info_ip.value = "";
        _user_info_port.value = "";

        update_start_server_button_state(button);
    }
    else {
        ipc.sendSyncchannel("start-server");
    }
}

function update_start_server_button_state(button) {
    if (button.classList.contains("disconnect")) {
        button.classList.remove("disconnect");
        button.textContent = "Démarrer";
    }
    else {
        button.classList.add("disconnect");
        button.textContent = "Arrêter";
    }
}

/*function change_upload_style(style = { list: true, tree: false }) {
    if (style.list) {
        _upload_container.classList.remove("folder");
        _upload_container.classList.add("list");
    }
    else {
        _upload_container.classList.add("folder");
        _upload_container.classList.remove("list");
    }
}*/