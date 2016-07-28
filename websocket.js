/**
 * Created by xlagunas on 1/04/16.
 */
var socketio      = require('socket.io');
var Call          = require('./Call').Call;
var User          = require('./User').User;
var CalendarEvent = require('./CalEvent').CalendarEvent;
var async         = require('async');
var fs            = require('fs');
var userManager = require('./managers/userManager');

var socketHandler =  function (socket) {

    socket.on('login', function(msg){
        if (msg && msg.username && msg.password) {
            userManager.login(msg.username, msg.password, function (data) {
                socket.username = data.username;
                socket._id = data.id;
                socket.status = 'ONLINE';
                if (!msg.type || msg.type !== "ANDROID") {
                    socket.emit('login', data);
                }
            }, function (error) {
                socket.emit('loginError', error);
            });
        }
    });

    socket.on('roster:ack', function (msg) {
        console.log('roster:ack');
        getSocketProperty(socket, 'id', function (idProposer) {
            getSocketProperty(socket, 'status', function (status) {
                findContactSocketById(idProposer, msg.id, function (socketContact) {
                    socketContact.emit('roster:ack', {id: idProposer, status: status});
                });
            });
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
        getSocketProperty(socket, 'id', function (id){
            userManager.listAllContacts(id, function(contacts){
                socket.emit('contacts:update', contacts);
                notifyContactsUserConnected(id, contacts.accepted);
            }, function(error){
                console.log('Error' +error);
            });
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
        userManager.acceptRelationship(socket._id, msg._id, function(){
            socket.join(msg._id);

            userManager.listAllContacts(socket._id, function(userData){
                socket.emit('contacts:update', userData);
            });

            findSocketById(msg._id, function(contactSocket){
                contactSocket.join(socket._id);

                userManager.listAllContacts(msg._id, function(contactData){
                    contactSocket.emit('contacts:update', contactData);
                    sendRosterUpdate(socket, contactSocket);
                    sendRosterUpdate(contactSocket, socket);
                });
            }, function(){
                console.log('socket not found, now should search for a token and send push!');
            });
        }, function(error){
           console.log("Error accepting user");
            console.log(error);
        });
    });

    socket.on('contacts:reject', function(msg){
        userManager.rejectRelationship(socket._id, msg._id, function(){
            console.log('successfully rejected relationship');
            updateUserList(socket, msg._id);
        }, function(error){
            console.log(error);
        });
    });

    socket.on('contacts:delete', function(msg){
        userManager.deleteRelationship(socket._id, msg._id, function(){
            console.log('successfully deleted relationship');
            updateUserList(socket, msg._id);
        }, function(error){
            console.log(error);
        })
    });

    function updateUserList(userSocket, contactId){
        userManager.listAllContacts(userSocket._id, function(userData){
            userSocket.emit('contacts:update', userData);
        });
        findSocketById(contactId, function(contactSocket){
            userManager.listAllContacts(contactId, function(contactData){
                contactSocket.emit('contacts:update', contactData)
            });
        }, function(){
            console.log('socket not found, now should search for a token and send push!');
        });
    }

    socket.on('contacts:update_list', function (msg){
        console.log('Entra al contacts:update_list');
        //If its an accept request, update own status and remote, also add each user to to its contact room on success
        getSocketProperty(socket, 'id', function (id){
            if (msg.current === 'requested' && msg.future === 'accepted') {
                async.parallel([
                    function(callback){
                        UpdateAndNotifyRelationship(socket, msg._id, msg.current, msg.future, callback(null, {socket: socket, joinTo: msg._id}));
                    },
                    function(callback){
                        findSocketById(msg._id, function (contactSocket){
                            UpdateAndNotifyRelationship(contactSocket, id, 'pending', 'accepted', callback(null, {socket: contactSocket, joinTo: id}));
                        });
                    }
                ],  function (error, results) {
                    if (!error){
                        results[0].socket.join(results[0].joinTo);
                        results[1].socket.join(results[1].joinTo);
                        sendRosterUpdate(results[0].socket, results[1].socket);
                        sendRosterUpdate(results[1].socket, results[0].socket);

                    }
                });
            } else {
                UpdateAndNotifyRelationship(socket, msg._id, msg.current, msg.future);
            }
        });
    });

    socket.on('list contacts:accepted', function(msg, callback){
        if (msg.length >0) {
            User
                .find({_id: {$in: msg}})
                .select('-pending -password -accepted -requested -blocked')
                .exec(function(error, data){
                    if (error) throw error;
                    callback(data);
                });
        }
        else {
            callback([]);
        }
    });

    socket.on('contacts:find', function (msg) {
        User.findMatchingUsers(msg.username, function(users){
            if (users)
                socket.emit('contacts:find', users);
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

    socket.on('disconnect', function () {
        socket.status = 'OFFLINE';
        getSocketProperty(socket, 'id', function(id){
            notifyDisconnectionToContacts(id, socket);
                socket.leave(id);
        });
    });

    socket.on('shutdown', function(data){
        if (data._id in users){
            var user = users[data._id];
            user.user.currentStatus = 'OFFLINE';
            notifyContacts(user);
            delete users[data._id];
        }
    });


    //callback is a function whose first parameter is the proposerId
    function getSocketProperty(socket, paramName, callback) {
        //id variable is used by the system in the newer versions so we alias our own
        var paramName = (paramName === 'id') ? '_id' : paramName;
        if (callback) {
            callback(socket[paramName]);
        }
    }

    function createCall (callerId, calleeId, callback) {
        Call.create({caller: callerId, callee: [calleeId]}, function (error, call){
            if (!error && call) {
                if (callback) callback(call);
            }
        });
    }

    function populateCall(call, callback) {
        Call.populate(call,{ path: 'caller callee',  select: 'name username firstSurname lastSurname email thumbnail'}, function(error, popCall){
            if (!error && popCall){
                if (callback) callback(popCall);
            }
        });
    }

    function findCallById(callId, callback) {
        Call.findById(callId, {path: 'caller callee', select: 'name username firstSurname lastSurname email thumbnail'}, function(err, call){
            if (!err && call) {
                if (callback) callback(call);
            }
        });
    }

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
    }

    socket.on('call:invite', function (msg){
        getSocketProperty(socket, 'id', function (idProposer) {
            findSocketById(msg.id, function (contactSocket){
                if (msg.call.type === 'CREATE'){
                    console.log('create nou');
                    createCall(idProposer, msg.id, function (call){
                        populateCall(call, function (populatedCall){
                            contactSocket.emit('call:invite', populatedCall);
                        });
                    });
                }

                else if (msg.call.type === 'JOIN'){
                    console.log('join nou');
                    findCallById(msg.call.id, function (populatedCall){
                        contactSocket.emit('call:invite', populatedCall);
                    });
                }

            });
        });
    });

    socket.on('call:accept', function(msg){
        console.log('call:accept');

        getSocketProperty(socket, 'id', function (idProposer) {
            Call.addUserToCall(msg.id, idProposer, function(call) {
                findSocketById(call.caller.id, function (contactSocket) {
                    contactSocket.emit('call:accept', call);
                });
            });
        });

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
        getSocketProperty(socket, 'id', function (idProposer){
            User.findById(idProposer, function (err, user){
                if (!err && user){
                    console.log('user: '+idProposer+' joined call room: '+msg.id);
                    socket.join('call:'+msg.id);
                    socket.broadcast.to('call:'+msg.id).emit('call:addUser', user);
                }
            });
        });
    });

    socket.on('call:unregister', function(msg){
        getSocketProperty(socket, 'id', function (idProposer){
            User.findById(idProposer, function (err, user){
                if (!err && user){
                    console.log('user: '+idProposer+' left call room: '+msg.id);
                    socket.broadcast.to('call:'+msg.id).emit('call:removeUser', user);
                    socket.leave('call:'+msg.id);
                }
            });
        });
    });

    socket.on('call:userDetails', function(msg){
        getSocketProperty(socket, 'id', function(id){
            User.findById(id, 'username name firstSurname lastSurname thumbnail email', function(error, user){
                if (!error && user){
                    findContactInRoom('call:'+msg.idCall, msg.idUser, function(socket){
                        socket.emit('call:userDetails', user);
                    });
                }
            });
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
        console.log('call:hangup, Room id: '+msg.id);
        var rooms = websockets.manager.roomClients[socket.id];
        console.log(rooms);
    });

    socket.on('webrtc:offer', function(msg){
        console.log('webrtc:offer');
        getSocketProperty(socket, 'id', function(id){
            findContactInRoom('call:'+msg.idCall, msg.idUser, function(socket){
                socket.emit(id+':offer', msg.offer);
            });
        });
    });

    socket.on('webrtc:answer', function(msg){
        console.log('webrtc:answer');
        getSocketProperty(socket, 'id', function(id){
            findContactInRoom('call:'+msg.idCall, msg.idUser, function(socket){
                socket.emit(id+':answer', msg.answer);
            });
        });
    });

    socket.on('webrtc:iceCandidate', function(msg){
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

module.exports.listen = function(app){
    io = socketio.listen(app);
    websockets = io.clients();

    io.on('connection', socketHandler);

    return io
};

module.exports.findSocketById = findSocketById;