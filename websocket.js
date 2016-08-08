/**
 * Created by xlagunas on 1/04/16.
 */
var socketio      = require('socket.io');
var Call          = require('./Call').Call;
var User          = require('./User').User;
var CalendarEvent = require('./CalEvent').CalendarEvent;
var async         = require('async');
var fs            = require('fs');
var userManager;

var socketHandler =  function (socket) {

    socket.on('login', function(msg){
        console.log(msg);
        msg = typeof msg === "string" ? JSON.parse(msg) : msg;

        if (msg && msg.username && msg.password) {
            userManager.login(msg.username, msg.password, function (data) {
                socket.username = data.username;
                socket._id = data.id;
                socket.status = 'ONLINE';
                if (!msg.type || msg.type !== "ANDROID") {
                    socket.emit('login', data);
                } else {
                    socket.emit('login', {ev: 'ok'});
                }
            }, function (error) {
                socket.emit('loginError', error);
            });
        }
    });

    socket.on('roster:ack', function (msg) {
        console.log('roster:ack');

        findContactSocketById(socket._id, msg.id, function (socketContact) {
            socketContact.emit('roster:ack', {id: socket._id, status: socket.status});
        });
    });

    socket.on('user:existing', function (msg){
        userManager.userExist(msg.username, function(exists){
            socket.emit('user:existing', exists);
        });
    });

    socket.on('user:create', function (msg) {
        var encodingType;
        if (msg.thumbnail) {
            if (msg.thumbnail.indexOf("jpeg") !== -1) {
                encodingType = "jpeg";
            } else if (msg.thumbnail.indexOf("png") != -1) {
                encodingType = "png";
            } else if (msg.thumbnail.indexOf("jpg") != -1) {
                encodingType = "jpg"
            } else {
                log.warn("No encoding type found for current image")
            }
            if (encodingType !== -1) {
                var base64Image = decodeBase64Image(msg.thumbnail);
                fs.writeFile('./app/images/' + msg.username + '.' + encodingType, base64Image.data, 'base64', function (err) {
                    if (err)
                        console.log(err);
                });
                msg.thumbnail = msg.username + '.' + encodingType;
                console.log('./' + msg.username + '.' + encodingType);
            }
        }

        userManager.createUser(msg, function(user){
            socket.emit('user:create', user);
        }, function(error){
            //TODO FRONTEND NOT IMPLEMENTED YET
            socket.emit('user:createError', {error: error.errmsg});
        });

    });
    function decodeBase64Image(dataString) {
        var matches = dataString.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/),
            response = {};

        if (matches.length !== 3) {
            return new Error('Invalid input string');
        }

        response.type = matches[1];
        response.data = new Buffer(matches[2], 'base64');

        return response;
    }

    //type = camera or image
    //extension = png/
    socket.on('user:changeImage', function (msg){
        console.log('user:changeImage');
        getSocketProperty(socket, 'id', function (id){
            fs.writeFile('./app/images/'+msg.username+'.png', msg.thumbnail.replace(/^data:image\/png;base64,/,''), 'base64', function(err) {
                if (!err){
                    User.findById(id, function(err, user){
                        user.thumbnail = '/images/'+msg.username+'.'+msg.extension;
                        user.save(function (err){
                            if (!err)
                                socket.emit('user:changeImage', user.thumbnail);
                        });
                    });
                }
            });
        });
    });

    socket.on('contacts:list', function(msg){
        userManager.listAllContacts(socket._id, function(contacts){
            socket.emit('contacts:update', contacts);
            notifyContactsUserConnected(socket._id, contacts.accepted);
        });
    });

    function notifyContactsUserConnected(userId, contacts){
        contacts.forEach(function(contact){
            console.log('------ subscribing user: '+userId+ ' to ' +contact.id);
            socket.join(contact.id);
        });
        console.log('+++++++ broadcasting roster:update to '+userId+' room');
        socket.broadcast.to(userId).emit('roster:update', {id: userId, status: 'ONLINE'})
    }

    socket.on('contacts:propose', function(msg) {
        userManager.requestRelationship(socket._id, msg._id, function () {
            userManager.listAllContacts(socket._id, function(data){
                socket.emit('contacts:update', data);
            });
        }, function (error) {
            console.log('error' + error);
        });
    });

    socket.on('contacts:accept', function(msg){
        userManager.acceptRelationship(socket._id, msg._id, function(populatedData){

            var data = {
                accepted:   populatedData.accepted,
                requested:  populatedData.requested,
                pending:    populatedData.pending,
                blocked:    populatedData.blocked
            };

            socket.join(msg._id);
            socket.emit('contacts:update', data);

            findSocketById(msg._id, function(contactSocket) {
                socket.emit('roster:update', {id: contactSocket._id, status: contactSocket.status});
            });
        }, function(error){
           console.log("Error accepting user");
            console.log(error);
        });
    });

    socket.on('contacts:reject', function(msg){
        userManager.rejectRelationship(socket._id, msg._id, function(populatedData){
            console.log('successfully rejected relationship');
            var data = {
                accepted:   populatedData.accepted,
                requested:  populatedData.requested,
                pending:    populatedData.pending,
                blocked:    populatedData.blocked
            };

            console.log(data);
            socket.emit('contacts:update', data);
        }, function(error){
            console.log(error);
        });
    });

    socket.on('contacts:delete', function(msg){
        userManager.deleteRelationship(socket._id, msg._id, function(populatedData){
            var data = {
                accepted:   populatedData.accepted,
                requested:  populatedData.requested,
                pending:    populatedData.pending,
                blocked:    populatedData.blocked
            };
            console.log('successfully deleted relationship');
            socket.emit('contacts:update', data);
        })
    });

    socket.on('contacts:find', function (msg) {
        userManager.findUsersContaining(msg.username, function(matchedUsers){
            socket.emit('contacts:find', matchedUsers);
        });
    });

    socket.on('calendar:createEvent', function(msg){
        console.log('calendar:createEvent');
        console.log('msg');

        CalendarEvent.create(msg, function(error, event){
            if (error){
                console.log(error);
            }
            else{
                getSocketProperty(socket, 'id', function(idUser){
                    CalendarEvent.getUserEvents(idUser, function(data){
                        console.log(data);
                        socket.emit('calendar:getEvents', data);
                    });
                });
            }
        });
    });

    socket.on('calendar:removeUser', function (msg){
        console.log('calendar:removeUser');
        console.log('id: '+msg.id);
        getSocketProperty(socket, 'id', function(idUser){
            CalendarEvent.findById(msg.id, function(error, event){
                event.delUser(idUser, function(){
                    CalendarEvent.getUserEvents(idUser, function(data){
                        console.log(data);
                        socket.emit('calendar:getEvents', data);
                    });
                });
            });
        });
    });

    socket.on('calendar:getEvents', function(msg){
        console.log('calendar:getEvents');
        getSocketProperty(socket, 'id', function(idUser){
            CalendarEvent.getUserEvents(idUser, function(data){
                socket.emit('calendar:getEvents', data);
            });
        });
    });

    socket.on('logout', function(){
        disconnectOrLogout(socket);
    });

    socket.on('disconnect', function () {
        disconnectOrLogout(socket);
    });

    function disconnectOrLogout(socket){
        socket.status = 'OFFLINE';
        var id = socket._id;
        notifyDisconnectionToContacts(id, socket);
    }

    //callback is a function whose first parameter is the proposerId
    function getSocketProperty(socket, paramName, callback) {
        //id variable is used by the system in the newer versions so we alias our own
        var paramName = (paramName === 'id') ? '_id' : paramName;
        if (callback) {
            callback(socket[paramName]);
        }
    }

    //TODO REFACTOR TO USERMANAGER
    function rejectCall (callId, callback) {
        Call.findByIdAndUpdate(callId,{status: 'CANCELLED'})
            .populate({
                path: 'caller callee',
                select: 'name username firstSurname lastSurname email thumbnail'
            })
            .exec(function(err, call){
                if (!err && call) {
                    if (callback) callback(call);
                }
            });
    }

    function UpdateAndNotifyRelationship(socket, contactId, oldStatus, newStatus, callback) {
        updateRelationship(socket, contactId, oldStatus, newStatus, function(user) {
            socket.emit('contacts:update', {
                accepted: user.accepted,
                requested: user.requested,
                pending: user.pending,
                blocked: user.blocked
            });
            if (callback) callback(user);
        });
    }

    function updateRelationship(socket, contactId, oldStatus, newStatus, callback) {
        getSocketProperty(socket, 'id', function (userId){
            //User.swapRelation(contactId, userId, oldStatus, newStatus, function (err, updatedUser) {
            User.swapRelation(userId, contactId, oldStatus, newStatus, function (err, updatedUser) {
                if (err) {
                    callback(err, 'updateError');
                }
                else {
                    if (callback) callback(updatedUser);
                }
            });
        });
    }

    function sendRosterUpdate(sourceSocket, destinationSocket) {
        destinationSocket.emit('roster:update', {id: sourceSocket._id, status: sourceSocket.status});
    }

    function updateSelfStatus(sourceSocket) {
        sendRosterUpdate(sourceSocket, SourceSocket);
    }

    function notifyDisconnectionToContacts (socketId, fullSocket) {
        User.listContacts(socketId, function(error, data){
            data.accepted.forEach(function (contact){
                console.log("sending to contact: "+contact.id);
                findContactSocketById(socketId, contact.id, function (contactSocket) {
                    sendRosterUpdate(fullSocket, contactSocket);
                });
            })
        });

        fullSocket.leave(socketId);
    }

    socket.on('call:invite', function (msg){
        userManager.sendCallInvitation(socket._id, msg.id);
    });
    socket.on('call:addUserToCall', function (msg){
        userManager.sendRunningCallInvitation(socket._id, msg.userId, msg.callId);
    });

    socket.on('call:accept', function(msg){
        console.log('call:accept');

        userManager.acceptCall(socket._id, msg.id);
    });

    socket.on('call:reject', function(msg){
        console.log('call:reject');
        //TODO at the moment there is no use on getting who cancels the call...
        getSocketProperty(socket, 'id', function (idProposer){
            rejectCall(msg.id, function (rejectedCall) {
                findSocketById(rejectedCall.caller.id, function (contactSocket) {
                    contactSocket.emit('call:reject', rejectedCall)
                });
            });
        });
    });

    socket.on('call:register', function(msg){

        msg = typeof msg === "string" ? JSON.parse(msg) : msg;

        User.findById(socket._id, function (err, user){
            if (!err && user){
                console.log('user: '+socket._id+' joined call room: '+msg.id);
                socket.join('call:'+msg.id);
                console.log(socket.username +"shouldn't receive addUser");
                socket.broadcast.to('call:'+msg.id).emit('call:addUser', user);
            }
        });
    });

    socket.on('call:unregister', function(msg){
        msg = typeof msg === "string" ? JSON.parse(msg) : msg;

        User.findById(socket._id, function (err, user){
            if (!err && user){
                console.log('user: '+socket._id+' left call room: '+msg.id);
                socket.broadcast.to('call:'+msg.id).emit('call:removeUser', user);
                socket.leave('call:'+msg.id);
            }
        });
    });

    socket.on('call:userDetails', function(msg){
        msg = typeof msg === "string" ? JSON.parse(msg) : msg;
        User.findById(socket._id, 'username name firstSurname lastSurname thumbnail email', function(error, user){
            if (!error && user){
                findContactInRoom('call:'+msg.idCall, msg.idUser, function(socket){
                    socket.emit('call:userDetails', user);
                });
            }
        });
    });

    function findContactInRoom(roomName, contactId, callback){
        var room = websockets.adapter.rooms[roomName];
        var found = false;

        for (var socketName in room.sockets){
            var contactSocket = websockets.connected[socketName];
            if (contactSocket._id === contactId && callback){
                callback(contactSocket);
                found = true;
            }
        }

        if (!found){
            console.log("not found contact in Room");
        }
    }


    socket.on('call:hangup', function (msg){
        msg = typeof msg === "string" ? JSON.parse(msg) : msg;

        console.log('call:hangup, Room id: '+msg.id);
        var rooms = websockets.manager.roomClients[socket.id];
        console.log(rooms);
    });

    socket.on('webrtc:offer', function(msg){
        msg = typeof msg === "string" ? JSON.parse(msg) : msg;
        msg.offer.type = msg.offer.type.toLowerCase();

        if (msg.offer.sdp == null){
            msg.offer.sdp = msg.offer.description;
            delete msg.offer.description;
        }

        console.log('sending webrtc:offer to '+msg.idUser);
        findContactInRoom('call:'+msg.idCall, msg.idUser, function(contactSocket){

            contactSocket.emit(socket._id+':offer', msg.offer);
        });
    });

    socket.on('webrtc:answer', function(msg){
        msg = typeof msg === "string" ? JSON.parse(msg) : msg;
        msg.answer.type = msg.answer.type.toLowerCase();
        if (msg.answer.sdp == null){
            msg.answer.sdp = msg.answer.description;
            delete msg.answer.description;
        }

        console.log('webrtc:answer');
        getSocketProperty(socket, 'id', function(id){
            findContactInRoom('call:'+msg.idCall, msg.idUser, function(socket){
                socket.emit(id+':answer', msg.answer);
            });
        });
    });

    socket.on('webrtc:iceCandidate', function(msg){
        msg = typeof msg === "string" ? JSON.parse(msg) : msg;

        if (msg.candidate.sdp){
            msg.candidate.candidate = msg.candidate.sdp;
            delete msg.candidate.sdp;
        }
        console.log('webrtc:iceCandidate '+socket._id);
        getSocketProperty(socket, 'id', function(id){
            findContactInRoom('call:'+msg.idCall, msg.idUser, function(socket){
                socket.emit(id+':iceCandidate', msg.candidate);
            });
        });
    });
};

function findContactSocketById(currentUserId, contactId, callback, notFoundCallback) {
    var clients = websockets.connected;
    var found = false;
    for (var socketName in clients){
        if (clients[socketName]._id === contactId && callback){
            found = true;
            callback(clients[socketName]);
        }
    }
    //this method and callbacks are only intended for android compatibility
    if (!found && notFoundCallback){
        notFoundCallback();
    }

}

function findSocketById(id, callback, notFoundCallback){
    findContactSocketById(null, id, callback, notFoundCallback);
}

module.exports.listen = function(app, injectedUserManager){
    io = socketio.listen(app);
    userManager = injectedUserManager;
    websockets = io.clients();

    io.on('connection', socketHandler);

    return io
};

module.exports.findSocketById = findSocketById;