const spawn = require('child_process').spawn;
let childProcess = null;

/*
 * Funktion: bindEvent()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  eventNames: (String) Event-Name z.B. click
 *  selector: (String) Den Element-Selector z.B. die ID oder Klasse usw.
 *  handler: (Object) Die Funktion welche ausgeführt werden soll
 *
 * Ist das Äquivalent zu .on(eventNames, selector, handler) in jQuery
 */
export const bindEvent = (eventNames, selectors, handler) => {
    eventNames.split(', ').forEach((eventName) => {
        document.addEventListener(eventName, function (event) {
            selectors.split(', ').forEach((selector) => {
                if (event.target.matches(selector + ', ' + selector + ' *')) {
                    let element = event.target.closest(selector);
                    handler.apply(element, arguments);
                }
            });
        }, false);
    });
};

// TODO: Comment
export function execShellCommand(cmd, options = []) {
    childProcess = spawn(cmd, options);

    childProcess.stdout.on('data', function(data) {
        console.log(data.toString());
    });
}

// TODO: Comment
export function removeActiveListItems() {
    let actives = document.querySelectorAll(".listBox li.active");
    if (actives) {
        for (let active of actives) {
            active.remove();
        }
    }
}