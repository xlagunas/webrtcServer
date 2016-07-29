/**
 * Created by xlagunas on 26/7/16.
 */

var async   = require('async');
var logEnabled = true;
var websocket = {};
var notificationManager;
var _ = require('underscore');
var User = require('./../User').User;

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
                if (onSuccess) onSuccess(_.uniq(data.uuid));
            } else {
                if (onError) onError({Error: "No tokens for this user"});
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
                notificationManager.sendRequestNotification(requesteeId, requesterId, contactData);
                callback(null, contactData);
            }, function(error){
                callback(error);
            });
        }
    }], function(error, results){
        if (error){
            if (onError) onError(error);
        } else {
            if (onSuccess)
                onSuccess(results);
        }
    });
};

exposed.rejectRelationship = function (requesterId, requesteeId, onSuccess, onError){
//when someone reject a relationship, his relationship status is requested while the other one's pending
    async.waterfall([function(callback){
        User.removeRelationship(requesteeId, 'pending', requesterId, callback);
    }, function(previousUpdate, callback){
        User.removeRelationship(requesterId, 'requested', requesteeId, function(error, data){
            if (error){
                callback(error, data);
            } else {
                notificationManager.sendRejectNotification(requesteeId, requesterId, data);
                callback(null, data);
            }
        });
    }], function(err, status){
        if (err){
            if (onError) onError(err);
        } else {
            if (onSuccess) onSuccess(status);
        }
    });
};

exposed.acceptRelationship = function (requesterId, requesteeId, onSuccess, onError){
//when someone accepts a relationship, his relationship statuns is requested while the other one's pending
    async.waterfall([function(callback){
        User.updateRelationship(requesteeId, 'pending', 'accepted', requesterId, callback);
    }, function(previousUpdate, callback){
        User.updateRelationship(requesterId, 'requested', 'accepted', requesteeId, function(error, data){
            notificationManager.sendAcceptNotification(requesteeId, requesterId, data);
            callback(null, data);
        });
    }], function(err, status){
        if (err){
            if (onError) onError(err);
        } else {
            if (onSuccess) onSuccess(status);
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
            User.addRelationship(requestee, requesteeStatus, requester, callback);
        }, function(result, callback){
            User.addRelationship(requester, requesterStatus, requestee, callback)
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

exposed.findUsersContaining = function(queryText, onSuccess, onError){
    User.findMatchingUsers(queryText, function(error, users){
        if (error) {
            if (onError) onError(error);
        } else {
            onSuccess(users);
        }
    });
};

exposed.createUser = function(userData, onSuccess, onError){
    User.create(userData, function(err, user){
        if (err){
            if(onError) onError(err);
        } else {
            onSuccess(user);
        }
    });
};

exposed.addToken = function(userId, tokenUUID, onSuccess, onError){
    User.addToken(userId, tokenUUID, function(error, success){
        if (error){
            if (onError) onError(error);
        } else {
            if (onSuccess){
                onSuccess(success);
            }
        }
    });
};

var log = function(msg){
    if (logEnabled){
        console.log(msg);
    }
};

exposed.websocket = function(){
    return websocket;
};

exposed.startWS = function(server){
    websocket = require('./../websocket');
    return websocket.listen(server, exposed);
};

module.exports = function() {
    notificationManager = require('./NotificationManager')(exposed);
    return exposed;
};

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
