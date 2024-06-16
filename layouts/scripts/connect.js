const _username_field = document.querySelector("[name='username']");
const _avatar_field = document.querySelector(".avatar-container");
const _connect_button = document.querySelector("[name='connect_button']");

let _avatars = _avatar_field.querySelectorAll(".avatar-image");
let _avatar_selected = _avatar_field.querySelector(".avatar-image.selected");

_connect_button.addEventListener("click", () => {
    reset_error();

    if (!_username_field.checkValidity()) render_error("exclamation-triangle", "Le nom d'utilisateur ne peut pas être laissé vide.", "#ffd000");

    const _avatar_sourcename = _avatar_selected.dataset.source;
    const _connect_response = JSON.parse(
        ipc.sendSyncchannel("connect", JSON.stringify({
            username: _username_field.value,
            avatar: _avatar_sourcename,
        }))
    );
});

_avatars.forEach((_avatar) => {
    _avatar.addEventListener("click", () => {
        _avatar_selected.classList.remove("selected");
        _avatar_selected = _avatar;
        _avatar_selected.classList.add("selected");
    });
});