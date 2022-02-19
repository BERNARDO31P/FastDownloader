import * as tools from "./tools.js";
import { addLinkToList } from "./tools.js";

const { clipboard } = require('electron');

// TODO: Comment
tools.bindEvent("click", ".input .add", function () {
    addLinkToList(this);
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
tools.bindEvent("click", ".input .paste", function () {
    let input = this.closest(".input").querySelector("input");
    input.value = clipboard.readText();

    addLinkToList(this);
});

// TODO: Comment
document.addEventListener("keydown", function (e) {
    if (e.code === "Delete") {
        tools.removeActiveListItems();
    }
});