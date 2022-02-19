import * as tools from "./tools.js";

// TODO: Comment
tools.bindEvent("click", ".input .add", function () {
    let input = this.closest(".input").querySelector("input");

    if (!input.value) {
        tools.showNotification("Sie haben keinen Link angegeben");
        return;
    }

    if (!input.value.match("http(?:s?):\\/\\/(?:www\\.|music\\.)?youtu(?:be\\.com\\/watch\\?v=|be\\.com\\/playlist\\?list=|\\.be\\/)([\\w\\-\\_]*)(&(amp;)?‌​[\\w\\?‌​=]*)?")) {
        tools.showNotification("Sie haben keinen gültigen Link angegeben");
        return;
    }

    let ul = document.querySelector(".listBox ul");
    let elements = ul.querySelectorAll("li");
    for (let element of elements) {
        if (element.textContent === input.value) {
            tools.showNotification("Dieser Link befindet sich bereits in der Liste");
            return;
        }
    }

    let li = document.createElement("li");
    li.textContent = input.value;

    ul.appendChild(li);
    input.value = "";

    tools.showNotification("Link wurde zur Liste hinzugefügt");
});

// TODO: Comment
tools.bindEvent("click", ".listBox li", function (e) {
    if (!e.ctrlKey) {
        let actives = this.closest(".listBox").querySelectorAll("li.active");
        for (let active of actives)
            active.classList.remove("active");
    }

    if (this.classList.contains("active")) {
        this.classList.remove("active");
    } else {
        this.classList.add("active");
    }
});

// TODO: Comment
tools.bindEvent("click", ".listBox .delete", function () {
    tools.removeActiveListItems();
});

// TODO: Comment
document.addEventListener("keydown", function (e) {
    if (e.code === "Delete") {
        tools.removeActiveListItems();
    }
});