/**
 * Created by xlagunas on 26/7/16.
 */

var User    = require('../User').User;
var async   = require('async');


var logEnabled = true;

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

exposed.listAllContacts = function(userId, onSuccess, onError){
  return exposed.listContactsByRelationshipType(userId, null, onSuccess, onError);
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

exposed.requestRelationship = function (requesterId, requesteeId, onSuccess, onError){
    var onErrorFunction = function(message){
        if (onError){
            return onError(message);
        }
    };
    //Check if theres an ongoing relationship
    async.waterfall([
        function(callback){
            User.checkIfRelationshipExists(requesterId, requesteeId, callback)
        }, function(callback){
            User.getRelationshipUsers(requesterId, requesteeId, callback)
        }
    ], function(error, data){
        if (error){
            log('Something went wrong!');
            onError(error);
        } else {
            var users = data[1];
            for (var i=0; i< users.length;i++){
                var user = users[i];
                if (user.id === requesterId){
                    user.pending.addToSet(requesteeId);
                } else if (user.id === requesteeId){
                    user.requested.addToSet(requesterId);
                }
            }

            //Create both relationships
            async.parallel([function(callback){
                User.addRelationship(requesterId, 'pending', requesteeId, callback)
            },function(callback){
                User.addRelationship(requesteeId, 'requested', requesterId, callback)
            }], function(err, results){
                if (error){
                    log('Error adding relationships');
                } else {
                    onSuccess();
                }
            });
        }
    });

    //User.checkIfRelationshipExists(requesterId, requesteeId, function(error, exists){
    //    if (error){
    //        log('Error checking if relationship exists');
    //        log(error);
    //        onErrorFunction({error: 'error retrieving users'});
    //    } else {
    //        if (exists){
    //            log('A relationship already exists between '+requesterId+' and '+requesteeId+' users');
    //            onErrorFunction({error: 'relationship already exists'});
    //        } else {
    //            User.getRelationshipUsers(requesterId, requesteeId, function(error, users){
    //            if (error || users.length !== 2){
    //                log('Error retrieving users '+requesterId+' and '+requesteeId+' to create relationship');
    //                onErrorFunction({error: 'error retrieving users'})
    //            } else {
    //
    //
    //                async.parallel({requesterId: function(callback){
    //                        User.addRelationship(requesterId, 'pending', requesteeId, callback)
    //                    }, requesteeId: function(callback){
    //                        User.addRelationship(requesteeId, 'requested', requesterId, callback)
    //                    }
    //                }, function(err, results){
    //
    //                });
    //
    //
    //            }
    //            });
    //        }
    //    }
    //});
};



var log = function(msg){
    if (logEnabled){
        console.log(msg);
    }
};

module.exports = exposed;

var Mongoose = require('mongoose');

function test() {
    Mongoose.connect('mongodb://localhost/rest_test');

    exposed.requestRelationship('576aa729154318d5030377bc', '579560fa3e513a710a6bdc3a', function(){
        console.log("SUCCESS!!!!");
    }, function(err) {
        console.log(err);
    });
}

test();
