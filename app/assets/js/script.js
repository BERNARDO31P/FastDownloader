const spawn = require('child_process').spawn;
let childProcess = null;

let execute = document.getElementById("execute");

execute.addEventListener("click", function () {
    execShellCommand(__dirname + "/assets/executable/youtube-dl.exe", ["https://www.youtube.com/watch?v=rWI2sNUXD04"]);
});

function execShellCommand(cmd, options = []) {
    childProcess = spawn(cmd, options);

    childProcess.stdout.on('data', function(data) {
        console.log(data.toString());
    });
}