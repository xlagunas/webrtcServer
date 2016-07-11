/**
 * Created by xlagunas on 1/04/16.
 */
var io =            require('socket.io');
var Call =          require('./Call').Call;
var User =          require('./User').User;
var CalendarEvent = require('./CalEvent').CalendarEvent;
var async         = require('async');
var fs            = require('fs');

var websockets;

var ws = function (socket) {

    socket.on('login', function(msg){
        if (msg && msg.username && msg.password){
            User.login(msg.username, msg.password, function(data){
                if (data.status === 'success'){

                    socket.username = data.user.username;
                    socket.id = data.user.id;
                    socket.status = 'ONLINE';

                    socket.emit('login', data);
                }
            });
        }
    });

    socket.on('roster:ack', function (msg) {
        console.log('roster:ack');
        findContactSocketById(socket.id, msg.id, function (socketContact) {
            socketContact.emit('roster:ack', {id: socket.id, status: socket.status});
        });
    });


    socket.on('user:existing', function (msg){
        User.exists(msg.username, function(exists){
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
        User.create(msg, function(error, newUser){
            if (error) throw error;
            socket.emit('user:create', newUser);
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
        fs.writeFile('./app/images/'+msg.username+'.png', msg.thumbnail.replace(/^data:image\/png;base64,/,''), 'base64', function(err) {
            if (!err){
                User.findById(socket.id, function(err, user){
                    user.thumbnail = '/images/'+msg.username+'.'+msg.extension;
                    user.save(function (err){
                        if (!err)
                            socket.emit('user:changeImage', user.thumbnail);
                    });
                });
            }
        });
    });

    socket.on('contacts:list', function(msg){
        var id = socket.id;
        console.log('id:' +id);
        User.listContacts(id, function(error, data){
            if (!error){
                console.log(data);
                socket.emit('contacts:update', data);
                data.accepted.forEach(function(contact){
                    findSocketById(contact.id, function(socket){
                        socket.emit('roster:update', {id: id, status: 'ONLINE'});
                    });
                });
            }
        });
    });

    socket.on('contacts:update_list', function (msg){
        console.log('Entra al contacts:update_list');
        //If its an accept request, update own status and remote, also add each user to to its contact room on success
        var id = socket.id;
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
                    sendRosterUpdate(results[0].socket, results[1].socket);
                    sendRosterUpdate(results[1].socket, results[0].socket);

                }
            });
        } else {
            UpdateAndNotifyRelationship(socket, msg._id, msg.current, msg.future);
        }
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

    socket.on('contacts:propose', function(msg){

        User.createRelation(socket.id, msg._id, 'pending', function(data){
            if (data){
                socket.emit('contacts:update', data);
            }
        });

        User.createRelation(msg._id, socket.id, 'requested', function(contactData){
            if (contactData){
                websockets.clients().forEach(function(socketContact){
                    if (socketContact.id === msg._id){
                        socketContact.emit('contacts:update', contactData);
                    }
                });
            }
        });
    });

    socket.on('calendar:createEvent', function(msg){
        console.log('calendar:createEvent');

        CalendarEvent.create(msg, function(error, event){
            if (!error){
                CalendarEvent.getUserEvents(socket.id, function(data){
                    console.log(data);
                    socket.emit('calendar:getEvents', data);
                });
            }
        });
    });

    socket.on('calendar:removeUser', function (msg){
        console.log('calendar:removeUser');
        console.log('id: '+msg.id);

        CalendarEvent.findById(msg.id, function(error, event){
            event.delUser(socket.id, function(){
                CalendarEvent.getUserEvents(socket.id, function(data){
                    console.log(data);
                    socket.emit('calendar:getEvents', data);
                });
            });
        });

    });

    socket.on('calendar:getEvents', function(msg){
        console.log('calendar:getEvents');

        CalendarEvent.getUserEvents(socket.id, function(data){
            socket.emit('calendar:getEvents', data);
        });

    });

    socket.on('disconnect', function () {
        socket.status = 'OFFLINE';
        notifyDisconnectionToContacts(socket.id, socket);
        socket.leave(socket.id);

    });

    socket.on('shutdown', function(data){
        if (data._id in users){
            var user = users[data._id];
            user.user.currentStatus = 'OFFLINE';
            notifyContacts(user);
            delete users[data._id];
        }
    });

    function findContactSocketById(currentUserId, contactId, callback) {
        //TODO CHECK WHAT WE WANTED TO DO HERE BEFORE (I think its just search for one user contact (inside the main room, or inside the current user's room)
        var clients = websockets.connected;
        for (var field in clients) {
            var socket = clients[field];
            if (socket.id === contactId) {
                if (callback) {
                    callback(socket);
                }
            }
        }
    }

    function findSocketById(id, callback){
        findContactSocketById(null, id, callback);
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
        User.swapRelation(socket.id, contactId, oldStatus, newStatus, function (err, updatedUser) {
            if (err) {
                callback(err, 'updateError');
            }
            else {
                if (callback) callback(updatedUser);
            }
        });
    }

    function sendRosterUpdate(sourceSocket, destinationSocket) {
        destinationSocket.emit('roster:update', {id: sourceSocket.id, status: sourceSocket.status})
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
        findSocketById(msg.id, function (contactSocket){
            if (msg.call.type === 'CREATE'){
                console.log('create nou');
                createCall(socket.id, msg.id, function (call){
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

    socket.on('call:accept', function(msg){
        console.log('call:accept');

        Call.addUserToCall(msg.id, socket.id, function(call) {
            findSocketById(call.caller.id, function (contactSocket) {
                contactSocket.emit('call:accept', call);
            });
        });

    });

    socket.on('call:reject', function(msg){
        console.log('call:reject');
        rejectCall(msg.id, function (rejectedCall) {
            findSocketById(rejectedCall.caller.id, function (contactSocket) {
                contactSocket.emit('call:reject', rejectedCall)
            });
        });
    });

    socket.on('call:register', function(msg){

        User.findById(socket.id, function (err, user){
            if (!err && user){
                console.log('user: '+socket.id+' joined call room: '+msg.id);
                socket.join('call:'+msg.id);
                socket.broadcast.in('call:'+msg.id).emit('call:addUser', user);
            }
        });
    });

    socket.on('call:unregister', function(msg){
        User.findById(socket.id, function (err, user){
            if (!err && user){
                console.log('user: '+socket.id+' left call room: '+msg.id);
                socket.broadcast.in('call:'+msg.id).emit('call:removeUser', user);
                socket.leave('call:'+msg.id);
            }
        });
    });

    socket.on('call:userDetails', function(msg){
        User.findById(socket.id, 'username name firstSurname lastSurname thumbnail email', function(error, user){
            if (!error && user){
                websockets.clients('call:'+msg.idCall).forEach(function(socket){
                    if (socket.id === msg.idUser){
                        socket.emit('call:userDetails', user);
                    }
                });
            }
        });
    });


    socket.on('call:hangup', function (msg){
        console.log('call:hangup, Room id: '+msg.id);

        var rooms = io.sockets.adapter.rooms[socket.id];
        console.log(rooms);
    });

    socket.on('webrtc:offer', function(msg){
        console.log('webrtc:offer');

        websockets.clients('call:'+msg.idCall).forEach(function(contact){
            if (contact.id === msg.idUser){
                contact.emit(socket.id+':offer', msg.offer);
            }
        });

    });

    socket.on('webrtc:answer', function(msg){
        console.log('webrtc:answer');

        websockets.clients('call:'+msg.idCall).forEach(function(contact){
            if (socket.id === msg.idUser){
                contact.emit(socket.id+':answer', msg.answer);
            }
        });
    });

    socket.on('webrtc:iceCandidate', function(msg){
        console.log('webrtc:iceCandidate');
        websockets.clients('call:'+msg.idCall).forEach(function(contact){
            if (contact.id === msg.idUser){
                contact.emit(socket.id+':iceCandidate', msg.candidate);
            }
        });
    });
};

module.exports = function(sockets){
    websockets = sockets;
    return ws;
};
