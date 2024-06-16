const render_error = (icon = "", message = "", color = "") => {
    const message_container = document.querySelector(".message-container");
    const message_element = document.createElement("div");
    const message_content = `
        <i class="icon fa fa-${icon}" style="color: ${color}"></i>
        <p class="message-text" style="color: ${color}">${message}</p>
    `;

    message_element.classList.add("message-element");
    message_element.innerHTML = message_content;
    message_container.appendChild(message_element);
}

const reset_error = () => {
    const message_container = document.querySelector(".message-container");
    message_container.innerHTML = null;
}

const convert_file_to_icon = (_file_ext) => {
    if (_file_ext === "exe" || _file_ext == "msi") _file_ext = "bin";
    return _file_ext;
}


window.addEventListener("DOMContentLoaded", () => {
    const user_info = document.querySelector(".user-info");

    const upload_file_detail_container = document.querySelector(".upload-detail-container");
    const upload_file_container = document.querySelector(".upload-item-container");
    const upload_address_container = document.querySelector(".upload-section .address");
    const download_parameter_container = document.querySelector(".server-detail-container");
    const download_file_container = document.querySelector(".download-item-container");

    /*if (upload_file_container) {
        resize_upload_container();
        window.addEventListener("resize", resize_upload_container);
    }

    if (download_file_container) {
        resize_download_container();
        window.addEventListener("resize", resize_download_container);
    }*/

    function resize_upload_container() {
        const user_info_height = getComputedStyle(user_info).height;
        const user_info_margin = getComputedStyle(user_info).marginBottom;
        const container = upload_file_container.parentElement.parentElement;

        container.style.height = `calc(100vh - ${user_info_height} - ${user_info_margin})`;

        /*const detail_height = getComputedStyle(upload_file_detail_container).height;
        const container_height = getComputedStyle(container).height;
        const height = parseFloat(container_height) - parseFloat(detail_height) - 11;
        upload_file_container.style.height = `${height}px`;
        console.log(detail_height, container_height, height)*/

        /*const container_height = getComputedStyle(container).height;
        const detail_container = getComputedStyle(upload_file_detail_container).height;
        upload_file_container.style.height = `calc(${container_height} - ${detail_container} - 15px)`;
        upload_address_container.style.height = `calc(${container_height} + 3px)`;*/
    }

    function resize_download_container() {
        const user_info_height = getComputedStyle(user_info).height;
        const user_info_margin = getComputedStyle(user_info).marginBottom;
        const container = download_file_container.parentElement;

        container.style.height = `calc(100vh - ${user_info_height} - ${user_info_margin})`;

        /*const container_height = getComputedStyle(container).height;
        const parameter_container = getComputedStyle(download_parameter_container).height;
        download_file_container.style.height = `calc(${container_height} - ${parameter_container} - 15px)`;*/
    }
});