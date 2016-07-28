/**
 * Created by xlagunas on 27/7/16.
 */


var websocket = require('../websocket');
var userManager = require('./UserManager');
var pushSender = require('../push-sender');

var logEnabled = true;

module.exports.sendRequestNotification = function(destinationId, data){
    console.log('This is sending a notification to the receiver');
    sendNotification(destinationId, 'contacts:update', data);

};
var sendNotification = function(destinationId, messageType, message){
  sendNotification(destinationId, messageType, message, message);
};

var sendNotification = function(destinationId, messageType, socketMessage, pushMessage){
    log("Attempting to notify "+destinationId+ ' message: '+message.toString() );
    websocket.findSocketById(destinationId, function(contactSocket){
        userManager.listAllContacts(destinationId, function(contactData){
            contactSocket.emit(messageType, contactData);
            //contactSocket.emit('contacts:update', contactData);
        });
    }, function() {
        console.log('socket not found, should check now for token');
        userManager.getUserTokens(destinationId, function(tokens){
            log('found token, attempting to send push notification');
            log(data);
            pushSender.sendMessage(tokens, pushMessage);
        });
    }, function (error) {
        log('Error attempting to obtain token');
        log(error);

    });
};

var log = function(message){
    if (logEnabled){
        console.log(message);
    }
};

