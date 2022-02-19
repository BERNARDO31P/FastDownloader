import * as tools from "./tools.js";
import {showNotification} from "./tools.js";

tools.bindEvent("click", ".input .add", function () {
    let input = this.closest(".input").querySelector("input");

    if (!input.value) {
        // TODO: Show error
        return;
    }

    let li = document.createElement("li");
    li.textContent = input.value;

    let ul = document.querySelector(".listBox ul");
    ul.appendChild(li);

    input.value = "";

    showNotification("Test", 1000);
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