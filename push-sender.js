/**
 * Created by xlagunas on 7/03/16.
 */
var gcm = require('node-gcm');
var sender = gcm.Sender('AIzaSyBHuNid-V61d5IpEZKL0ugn5Mm-o_gvjTI');

var sendUser = function (token, username) {
    var message = new gcm.Message();
    message.addData('user', username);

    sender.send(message, {registrationTokens: [token]}, function (err, response) {
        if (err) console.error(err);
        else console.log(response);
    });
};

var sendMessage = function (tokens, message){

    if (tokens !== null) {
        var gcmMessage = new gcm.Message();
        gcmMessage.addData(message);

        sender.send(gcmMessage, {registrationTokens: tokens}, function (err, response) {
            if (err) console.error(err);
            else console.log(response);
        });
    } else {
        console.log("Not sending push notifications, no tokens found");
    }
};

exports.Send = sendUser;
exports.sendMessage = sendMessage;