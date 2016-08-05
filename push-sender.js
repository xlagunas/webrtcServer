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

var sendMessage = function (tokens, message, onInvalidTokens){

    if (tokens !== null) {
        var gcmMessage = new gcm.Message();
        gcmMessage.addData(message);

        sender.send(gcmMessage, {registrationTokens: tokens}, function (err, response) {
            if (err)
                console.error(err);
            else {
                var invalidTokens = [];
                for (var i=0; i<response.results.length;i++){
                    if (response.results[i].error && response.results[i].error === 'NotRegistered'){
                        invalidTokens.push(tokens[i]);
                    }
                }
                if (invalidTokens.length > 0){
                    onInvalidTokens(invalidTokens);
                }
            }
        });
    } else {
        console.log("Not sending push notifications, no tokens found");
    }
};

exports.Send = sendUser;
exports.sendMessage = sendMessage;