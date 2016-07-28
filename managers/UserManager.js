/**
 * Created by xlagunas on 26/7/16.
 */

var User    = require('../User').User;
var async   = require('async');
var logEnabled = true;
var io = require('../websocket');
var pushSender = require('../push-sender');
var exposed = {};

exposed.login = function(username, password, onSuccess, onError){
    log('Attempting to log: '+username);
    User.login(username, password, function(data){
        if (data.status === 'success'){
            log(username +' successfully logged');
            if (onSuccess) {
                return onSuccess(data.user);
            }
        } else {
            log('Error login '+username);
            if (onError) {
                return onError({error: data.msg});
            }
        }
    });
};

exposed.userExist = function(username, callback){
    log('Checking if user '+username+' exists');
    User.exists(username, function(exists){
        log('Exists: '+exists);
        if (callback) {
            callback(exists);
        }
    });
};

exposed.createUser = function(newUser, onSuccess, onError){
    log('Attempting to create new user.');
    User.create(newUser, function(error, newUser){
        if (error){
            log('Error creating user. '+error.errmsg);
            if (onError){
                onError({error: error.errmsg});
            }
        }
        else {
            log('User '+newUser.username+'successfully created');
            if (onSuccess) {
                onSuccess(newUser);
            }
        }
    });
};

exposed.getUserTokens = function(userId, onSuccess, onError){
    log('Getting user '+userId+' token');
    User.getToken(userId, function(err, data){
        if (err){
            if (onError) onError(err);
        } else {
            if (data.uuid !== null) {
                if (onSuccess) onSuccess(data.uuid);
            }
        }
    });
};

exposed.listAllContacts = function(userId, onSuccess, onError){
  return exposed.listContactsByRelationshipType(userId, null, onSuccess, onError);
};

exposed.checkIfRelationshipExists = function(requestedId, requesteeId, onSuccess, onError){
    async.waterfall([function(callback) {
        User.checkIfRelationshipExists(requestedId, requesteeId, callback);
    }, function(existsFirstUser, callback){
        if (existsFirstUser){
            if (onError) onError({error: "Relationship exists"});
        } else {
            User.checkIfRelationshipExists(requesteeId, requestedId, callback);
        }
    }], function(error, existsSecondUser){
        if (error || existsSecondUser) {
            if (onError) onError({error: "Relationship exists"});
        } else {
            if (onSuccess) onSuccess();
        }
    });
};

exposed.listContactsByRelationshipType = function(userId, relationshipType, onSuccess, onError){
    log('Requesting user '+userId+ ' contacts');
    User.listContacts(userId, function(error, data) {
        if (error){
            if(onError) {
                log('Error requesting user '+userId+ ' contacts');
                onError(error);
            }
        } else {
            var callbackData;
            if (relationshipType){
                callbackData = data[relationshipType];
            } else {
                callbackData = data;
            }
            log('Successfully loaded contacts');
            if (onSuccess) {
                onSuccess(callbackData);
            }
        }
    });
};

exposed.requestRelationship = function (requesterId, requesteeId, onSuccess, onError) {
    async.waterfall([function(callback){
        return exposed.checkIfRelationshipExists(requesterId, requesteeId, function(exists){
            callback(null, exists);
        }, function(error){
            callback(error);
        });
    }, function(exists, callback){
        if (exists) callback({error: 'A relationship exists'});
        else {
            exposed.createBiDirectionalRelationship(requesterId, 'pending', requesteeId, 'requested', function(contactData){
                exposed.sendRequestNotification(requesteeId, requesterId, contactData);
                callback(null, "success");
            }, function(error){
                callback(error);
            });
        }
    }], function(error, results){
        if (error){
            if (onError) onError(error);
        } else {
            if (onSuccess)
                onSuccess();
        }
    });
};

exposed.rejectRelationship = function (requesterId, requesteeId, onSuccess, onError){
//when someone reject a relationship, his relationship status is requested while the other one's pending
    async.waterfall([function(callback){
        User.removeRelationship(requesterId, 'requested', requesteeId, callback);
    }, function(previousUpdate, callback){
        User.removeRelationship(requesteeId, 'pending', requesterId, callback);
    }], function(err, status){
        if (err){
            if (onError) onError(err);
        } else {
            if (onSuccess) onSuccess();
        }
    });
};

exposed.acceptRelationship = function (requesterId, requesteeId, onSuccess, onError){
//when someone accepts a relationship, his relationship statuns is requested while the other one's pending
    async.waterfall([function(callback){
        User.updateRelationship(requesterId, 'requested', 'accepted', requesteeId, callback);
    }, function(previousUpdate, callback){
        User.updateRelationship(requesteeId, 'pending', 'accepted', requesterId, callback);
    }], function(err, status){
        if (err){
            if (onError) onError(err);
        } else {
            if (onSuccess) onSuccess();
        }
    });
};

exposed.deleteRelationship = function (requesterId, requesteeId, onSuccess, onError){
//when someone reject a relationship, his relationship status is requested while the other one's pending
    async.waterfall([function(callback){
        User.removeRelationship(requesterId, 'accepted', requesteeId, callback);
    }, function(previousUpdate, callback){
        User.removeRelationship(requesteeId, 'accepted', requesterId, callback);
    }], function(err, status){
        if (err){
            if (onError) onError(err);
        } else {
            if (onSuccess) onSuccess();
        }
    });
};


exposed.createBiDirectionalRelationship = function(requester, requesterStatus, requestee, requesteeStatus, onSuccess, onError){
    async.waterfall([
        function(callback){
            User.getRelationshipUsers(requester, requestee, callback)
        }, function(result, callback){
            User.addRelationship(requester, requesterStatus, requestee, callback)
        }, function(result, callback){
            User.addRelationship(requestee, requesteeStatus, requester, callback);
        }
    ], function(err, result){
        if (err){
            log('Error: couldn\'t create relationship');
            onError({error: 'couldn\'t create relationship'})
        } else {
            onSuccess(result);
        }
    });
};



exposed.sendNotification = function(destinationId, messageType, message){
    sendNotification(destinationId, messageType, message, message);
};

exposed.sendNotification = function (destinationId, messageType, socketMessage, pushMessage){
    log("Attempting to notify "+destinationId+ ' message: '+socketMessage.toString() );
    io.findSocketById(destinationId, function(contactSocket){
        console.log('socket found sending notification');
        contactSocket.emit(messageType, socketMessage);
    }, function() {
        console.log('socket not found, should check now for token');
        exposed.getUserTokens(destinationId, function(tokens){
            log('found token, attempting to send push notification');
            log(tokens);
            pushSender.sendMessage(tokens, pushMessage);
        }, function(error){
            log("Error searching for tokens!")

        });
    }, function (error) {
        log('Error attempting to obtain token');
        log(error);

    });
};

exposed.sendRequestNotification = function(destinationId, contactData){
    console.log('This is sending a notification to the receiver');

    exposed.listAllContacts(destinationId, function(contacts){

        var pushMessage = {
            username: contactData.username,
            name: contactData.name + " " + contactData.firstSurname + " " + contactData.lastSurname,
            thumbnail: contactData.thumbnail,
            type: 1
        };

        exposed.sendNotification(destinationId, 'contacts:update', contacts, pushMessage);
    });

};

var log = function(msg){
    if (logEnabled){
        console.log(msg);
    }
};

module.exports = exposed;

//
//function test() {
//    var connection = Mongoose.connect('mongodb://localhost/rest_test');
//
//    //exposed.requestRelationship('576aa729154318d5030377bc', '579560fa3e513a710a6bdc3a', function(){
//    //    console.log("SUCCESS!!!!");
//    //}, function(err) {
//    //    console.log(err);
//    //});
//
//    //exposed.acceptRelationship('579560fa3e513a710a6bdc3a', '576aa729154318d5030377bc', function(){
//    //    console.log("SUCCESS!!!!");
//    //}, function(err) {
//    //    console.log(err);
//    //});
//
//    //exposed.deleteRelationship('579560fa3e513a710a6bdc3a', '576aa729154318d5030377bc',function(){
//    //    console.log("SUCCESS!!!!");
//    //}, function(err) {
//    //    console.log(err);
//    //});
//
//    //exposed.requestRelationship('576aa729154318d5030377bc', '579560fa3e513a710a6bdc3a', function(){
//    //    console.log("SUCCESS!!!!");
//    //}, function(err) {
//    //    console.log(err);
//    //});
//
//    //exposed.rejectRelationship('579560fa3e513a710a6bdc3a', '576aa729154318d5030377bc', function(){
//    //    console.log("SUCCESS!!!!");
//    //}, function(err) {
//    //    console.log(err);
//    //});
//
//    exposed.deleteRelationship('579560fa3e513a710a6bdc3a', '576aa729154318d5030377bc',function(){
//        console.log("SUCCESS!!!!");
//    }, function(err) {
//        console.log(err);
//    });
//
//
//}

//test();
