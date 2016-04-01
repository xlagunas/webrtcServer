/**
 * Created by xlagunas on 1/04/16.
 */

var ws = function (socket) {
    socket.emit('news', { hello: 'world' });
    socket.on('my other event', function (data) {
        console.log(data);
    });
};

module.exports = ws;
