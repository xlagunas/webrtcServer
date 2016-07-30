/**
 * Created by xlagunas on 27/7/16.
 */

var pushSender = require('./../push-sender');
var userManager;
var logEnabled = true;

var friendshipRequestedTypeMessage = 1;
var friendshipAcceptedTypeMessage = 3;
var friendshipRejectedTypeMessage = 4;
var friendshipDeletedTypeMessage = 5;



var notificationManager = {};

notificationManager.sendRequestNotification = function(destinationId, senderId, contactData){
    console.log('This is sending a notification to the receiver');

    userManager.listAllContacts(destinationId, function(contacts){

        var pushMessage = {
            username: contactData.username,
                name: contactData.name + " " + contactData.firstSurname + " " + contactData.lastSurname,
            thumbnail: contactData.thumbnail,
            type: friendshipRequestedTypeMessage
        };

        sendNotification(destinationId, 'contacts:update', contacts, pushMessage);
    });

};

notificationManager.sendAcceptNotification = function(destinationId, senderId, contactData){
    userManager.listAllContacts(destinationId, function(userData){
        var pushMessage = {
            username: contactData.username,
            name: contactData.name + " " + contactData.firstSurname + " " + contactData.lastSurname,
            thumbnail: contactData.thumbnail,
            type: friendshipAcceptedTypeMessage
        };

        userManager.websocket().findSocketById(destinationId, function(contactSocket){
                contactSocket.join(senderId);
                contactSocket.emit('contacts:update', userData);
                userManager.websocket().findSocketById(senderId, function(socket){
                    socket.emit('roster:update', {id: contactSocket._id, status: contactSocket.status});
                });
            },
            function(){
                console.log('socket not found, should check now for token');
                userManager.getUserTokens(destinationId, function(tokens){
                    log('found token, attempting to send push notification');
                    log(tokens);
                    pushSender.sendMessage(tokens, pushMessage);
                }, function(error){
                    log("Error searching for tokens!");
                    log(error);
                });
            }, function (error) {
                log('Error attempting to obtain token');
                log(error);
            });
    });

};

notificationManager.sendRejectNotification = function(destinationId, senderId, contactData){
    userManager.listAllContacts(destinationId, function(userData){
        var pushMessage = {
            username: contactData.username,
            name: contactData.name + " " + contactData.firstSurname + " " + contactData.lastSurname,
            thumbnail: contactData.thumbnail,
            type: friendshipRejectedTypeMessage
        };

        sendNotification(destinationId, 'contacts:update', userData, pushMessage);
    });

};

notificationManager.sendDeleteNotification = function(destinationId, senderId, contactData){
    userManager.listAllContacts(destinationId, function(userData){
        var pushMessage = {
            username: contactData.username,
            name: contactData.name + " " + contactData.firstSurname + " " + contactData.lastSurname,
            thumbnail: contactData.thumbnail,
            type: friendshipDeletedTypeMessage
        };

        sendNotification(destinationId, 'contacts:update', userData, pushMessage);
    });

};

function sendNotification(destinationId, messageType, message){
  sendNotification(destinationId, messageType, message, message);
}

function sendNotification(destinationId, messageType, socketMessage, pushMessage){
    log("Attempting to notify "+destinationId+ ' message: '+socketMessage.toString() );
    userManager.websocket().findSocketById(destinationId, function(contactSocket){
        console.log('socket found sending notification');
        contactSocket.emit(messageType, socketMessage);
    }, function() {
        console.log('socket not found, should check now for token');
        userManager.getUserTokens(destinationId, function(tokens){
            log('found token, attempting to send push notification');
            log(tokens);
            pushSender.sendMessage(tokens, pushMessage);
        }, function(error){
            log("Error searching for tokens!");
            log(error);
        });
    }, function (error) {
        log('Error attempting to obtain token');
        log(error);

    });
}

var log = function(message){
    if (logEnabled){
        console.log(message);
    }
};

module.exports = function(userManagerDependency){
    userManager = userManagerDependency;
    return notificationManager;
};
