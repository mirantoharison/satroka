const _user_info_username = document.querySelector(".user-info-element.username");
const _user_info_avatar = document.querySelector(".user-info .avatar");

ipc.receivechannel("user-detail", (e, data) => {
    const user = { ...JSON.parse(data) };

    if (Object.keys(user).length > 0) {
        _user_info_username.textContent = user.username;
        _user_info_avatar.setAttribute("src", pathrd.join(".", "assets", "avatars", `${user.avatar}.png`));
        _user_info_avatar.dataset.source = user.avatar;
    }
    else _user_info_username.parentElement.remove();
});