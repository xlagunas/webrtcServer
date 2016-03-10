/**
 * Created by xlagunas on 7/03/16.
 */
var gcm = require('node-gcm');

var sendUser = function (token, username) {
    var message = new gcm.Message();
    var sender = gcm.Sender('AIzaSyBHuNid-V61d5IpEZKL0ugn5Mm-o_gvjTI');

    //var registeredToken = "eCxx72RkOko:APA91bGSpx4HqXx4XZBiUZw1VLDAkBX-mRtI9n9gvvyQxxfkGwhW6zFFU_qggelXZyMW2e99lOMwxUH1J96lrKEr8NAQd1OO_waKbDVAzDMpf_Xr2Zwq-x8y8VPGvPKJVponU-tNK-aY";
    //var registeredToken = "eBzQRr7I1HE:APA91bFQIHoYy3luyvm2kAqBdfd1CwGLT--uOg_f-7stKZKDw4AXYo1XU5ALqEeBQava1Y6lSN7XV1_YHnnnHxLWTwPrkVEOGqT_9UdUex-4D_WO_Y_e67hHgVTzj7NM5C4-F2HrApj7";
    message.addData('user', username);

    sender.send(message, {registrationTokens: [token]}, function (err, response) {
        if (err) console.error(err);
        else console.log(response);
    });
};

exports.Send = sendUser;