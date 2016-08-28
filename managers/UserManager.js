/**
 * Created by xlagunas on 26/7/16.
 */

var async = require('async');
var logEnabled = true;
var websocket = {};
var notificationManager;
var _ = require('underscore');
var User = require('./../User').User;
var Call = require('./../Call').Call;

var exposed = {};

exposed.login = function (username, password, onSuccess, onError) {
    User.login(username, password, function (data) {
        if (data.status === 'success') {
            if (onSuccess) {
                return onSuccess(data.user);
            }
        } else {
            if (onError) {
                return onError({error: data.msg});
            }
        }
    });
};

exposed.userExist = function (username, callback) {
    log('Checking if user ' + username + ' exists');
    User.exists(username, function (exists) {
        log('Exists: ' + exists);
        if (callback) {
            callback(exists);
        }
    });
};

exposed.userWithEmailExist = function (email, callback) {
    User.findByEmail(email, function(error, newUser){
        if (error){
            if (callback) {
                callback(false);
            }
        } else {
            if (callback){
                callback(newUser != null ? true : false);
            }
        }
    });
};

//userId is the same so if already assigned, it doesn't matter
exposed.updateFacebookTokenAndProfilePic = function (email, facebookId, thumbnail, onSuccess, onError) {
    User.updateSocialFB(email, facebookId, thumbnail, function(err, user){
        if (err) {
            if (onError){
                onError(err);
            }
        } else {
            if (onSuccess){
                onSuccess(user);
            }
        }
    });
};

exposed.updateGoogleTokenAndProfilePic = function (email, facebookId, thumbnail, onSuccess, onError) {
    User.updateSocialGoogle(email, facebookId, thumbnail, function(err, user){
        if (err) {
            if (onError){
                onError(err);
            }
        } else {
            if (onSuccess){
                onSuccess(user);
            }
        }
    });
};


exposed.createUser = function (newUser, onSuccess, onError) {
    log('Attempting to create new user.');
    User.create(newUser, function (error, newUser) {
        if (error) {
            log('Error creating user. ' + error.errmsg);
            if (onError) {
                onError({error: error.errmsg});
            }
        }
        else {
            log('User ' + newUser.username + 'successfully created');
            if (onSuccess) {
                onSuccess(newUser);
            }
        }
    });
};

exposed.getUserTokens = function (userId, onSuccess, onError) {
    log('Getting user ' + userId + ' token');
    User.getToken(userId, function (err, data) {
        if (err) {
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


exposed.listAllContacts = function (userId, onSuccess, onError) {
    return exposed.listContactsByRelationshipType(userId, null, onSuccess, onError);
};

exposed.checkIfRelationshipExists = function (requestedId, requesteeId, onSuccess, onError) {
    async.waterfall([function (callback) {
        User.checkIfRelationshipExists(requestedId, requesteeId, callback);
    }, function (existsFirstUser, callback) {
        if (existsFirstUser) {
            if (onError) onError({error: "Relationship exists"});
        } else {
            User.checkIfRelationshipExists(requesteeId, requestedId, callback);
        }
    }], function (error, existsSecondUser) {
        if (error || existsSecondUser) {
            if (onError) onError({error: "Relationship exists"});
        } else {
            if (onSuccess) onSuccess();
        }
    });
};

exposed.listContactsByRelationshipType = function (userId, relationshipType, onSuccess, onError) {
    log('Requesting user ' + userId + ' contacts');
    User.listContacts(userId, function (error, data) {
        if (error) {
            if (onError) {
                log('Error requesting user ' + userId + ' contacts');
                onError(error);
            }
        } else {
            var callbackData;
            if (relationshipType) {
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
    async.waterfall([function (callback) {
        return exposed.checkIfRelationshipExists(requesterId, requesteeId, function (exists) {
            callback(null, exists);
        }, function (error) {
            callback(error);
        });
    }, function (exists, callback) {
        if (exists) callback({error: 'A relationship exists'});
        else {
            exposed.createBiDirectionalRelationship(requesterId, 'pending', requesteeId, 'requested', function (contactData) {
                notificationManager.sendRequestNotification(requesteeId, requesterId, contactData);
                callback(null, contactData);
            }, function (error) {
                callback(error);
            });
        }
    }], function (error, results) {
        if (error) {
            if (onError) onError(error);
        } else {
            if (onSuccess)
                onSuccess(results);
        }
    });
};

exposed.rejectRelationship = function (requesterId, requesteeId, onSuccess, onError) {
//when someone reject a relationship, his relationship status is requested while the other one's pending
    async.waterfall([function (callback) {
        User.removeRelationship(requesteeId, 'pending', requesterId, callback);
    }, function (previousUpdate, callback) {
        User.removeRelationship(requesterId, 'requested', requesteeId, function (error, data) {
            if (error) {
                callback(error, data);
            } else {
                notificationManager.sendRejectNotification(requesteeId, requesterId, data);
                callback(null, data);
            }
        });
    }], function (err, status) {
        if (err) {
            if (onError) onError(err);
        } else {
            if (onSuccess) onSuccess(status);
        }
    });
};

exposed.acceptRelationship = function (requesterId, requesteeId, onSuccess, onError) {
//when someone accepts a relationship, his relationship statuns is requested while the other one's pending
    async.waterfall([function (callback) {
        User.updateRelationship(requesteeId, 'pending', 'accepted', requesterId, callback);
    }, function (previousUpdate, callback) {
        User.updateRelationship(requesterId, 'requested', 'accepted', requesteeId, function (error, data) {
            notificationManager.sendAcceptNotification(requesteeId, requesterId, data);
            callback(null, data);
        });
    }], function (err, status) {
        if (err) {
            if (onError) onError(err);
        } else {
            if (onSuccess) onSuccess(status);
        }
    });
};

exposed.deleteRelationship = function (requesterId, requesteeId, onSuccess, onError) {
    async.waterfall([function (callback) {
        User.removeRelationship(requesteeId, 'accepted', requesterId, callback);
    }, function (previousUpdate, callback) {
        User.removeRelationship(requesterId, 'accepted', requesteeId, function (err, data) {
            if (err) {
                callback(err, null);
            } else {
                notificationManager.sendDeleteNotification(requesteeId, requesterId, data);
                callback(null, data);
            }
        });
    }], function (err, status) {
        if (err) {
            if (onError) onError(err);
        } else {
            if (onSuccess) onSuccess(status);
        }
    });
};


exposed.createBiDirectionalRelationship = function (requester, requesterStatus, requestee, requesteeStatus, onSuccess, onError) {
    async.waterfall([
        function (callback) {
            User.getRelationshipUsers(requester, requestee, callback)
        }, function (result, callback) {
            User.addRelationship(requestee, requesteeStatus, requester, callback);
        }, function (result, callback) {
            User.addRelationship(requester, requesterStatus, requestee, callback)
        }
    ], function (err, result) {
        if (err) {
            log('Error: couldn\'t create relationship');
            onError({error: 'couldn\'t create relationship'})
        } else {
            onSuccess(result);
        }
    });
};

exposed.findUsersContaining = function (queryText, onSuccess, onError) {
    User.findMatchingUsers(queryText, function (error, users) {
        if (error) {
            if (onError) onError(error);
        } else {
            onSuccess(users);
        }
    });
};

exposed.createUser = function (userData, onSuccess, onError) {
    User.create(userData, function (err, user) {
        if (err) {
            if (onError) onError(err);
        } else {
            onSuccess(user);
        }
    });
};

exposed.addToken = function (userId, tokenUUID, onSuccess, onError) {
    User.addToken(userId, tokenUUID, function (error, success) {
        if (error) {
            if (onError) onError(error);
        } else {
            if (onSuccess) {
                onSuccess(success);
            }
        }
    });
};

exposed.removeTokens = function (userId, invalidTokens, onSuccess, onError) {
    User.removeTokens(userId, invalidTokens, function (error, success) {
        if (error) {
            if (onError) {
                console.log('error deleting invalid tokens for user ' + userId);
                onError(error);
            }
        } else {
            console.log('successfully deleted invalid tokens for user ' + userId);
            if (onSuccess) {
                onSuccess(data);
            }
        }
    });
};


exposed.sendCallInvitation = function (userId, contactId, onSuccess, onError) {
    Call.createCall(userId, contactId, function (error, call) {
        if (error) {
            if (onError) onError(error);
        } else {
            notificationManager.sendCallRequest(contactId, userId, call);
            if (onSuccess) onSuccess(call);
        }
    });
};

//this function sends to a third user an invite offer
exposed.sendRunningCallInvitation = function (userId, contactId, callId, onSuccess, onError) {
    Call.findCallById(callId, function (error, call) {
        if (error) {
            if (onError) onError(error);
        } else {
            notificationManager.sendCallRequest(contactId, userId, call);
            if (onSuccess) onSuccess(call);
        }
    });
};

exposed.acceptCall = function (userId, callId, onSuccess, onError) {
    Call.addUserToCall(callId, userId, function (error, data) {
        if (error) {
            if (onError) onError(error);
        } else {
            notificationManager.sendCallAccept(data.caller.id, data);
            if (onSuccess) onSuccess(data);
        }
    });
};

//exposed.rejectCall = function (userId, contactId, onSuccess, onError) {
//    Call.rejectCall(userId, contactId, function(err, data){
//        if (err){
//            if (onError) onError(error);
//        } else {
//            notificationManager.sendRejectCall()
//        }
//    });
//};


var log = function (msg) {
    if (logEnabled) {
        console.log(msg);
    }
};

exposed.websocket = function () {
    return websocket;
};

exposed.startWS = function (server) {
    websocket = require('./../websocket');
    return websocket.listen(server, exposed);
};

module.exports = function () {
    notificationManager = require('./NotificationManager')(exposed);
    return exposed;
};
