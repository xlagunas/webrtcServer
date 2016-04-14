/**
 * Created by xlagunas on 1/04/16.
 */
var io =            require('socket.io');
var Call =          require('./Call').Call;
var User =          require('./User').User;
var CalendarEvent = require('./CalEvent').CalendarEvent;
var async         = require('async');

var websockets;

var ws = function (socket) {

    socket.on('login', function(msg){
        if (msg && msg.username && msg.password){
            User.login(msg.username, msg.password, function(data){
                if (data.status === 'success'){
                    socket.set('username', data.user.username);
                    socket.set('id', data.user.id);
                    socket.set('status', 'ONLINE');

                    socket.emit('login', data);

                }
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
        User.exists(msg.username, function(exists){
            socket.emit('user:existing', exists);
        });
    });

    socket.on('user:create', function (msg) {
        console.log('./'+msg.username+'.png');

        fs.writeFile('./app/images/'+msg.username+'.png', msg.thumbnail.replace(/^data:image\/png;base64,/,''), 'base64', function(err) {
            if (err)
                console.log(err);
        });
        msg.thumbnail = msg.username +'.png';
        User.create(msg, function(error, newUser){
            if (error) throw error;
            socket.emit('user:create', newUser);
        });
    });

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
            console.log('id:' +id);
            User.listContacts(id, function(error, data){
                if (!error){
                    console.log(data);
                    socket.emit('contacts:update', data);
                    data.accepted.forEach(function(contact){
                        console.log('subscribing user: '+id+' to '+contact.id);
                        socket.join(contact.id);
                    });
                    console.log('broadcasting to Room: '+id);
                    socket.broadcast.to(id).emit('roster:update', {id: id, status: 'ONLINE'});
                }
            });
        });
    });

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

    socket.on('contacts:propose', function(msg){
        socket.get('id', function(error, idProposer){

            User.createRelation(idProposer, msg._id, 'pending', function(data){
                if (data){
                    socket.emit('contacts:update', data);
                }
            });

            User.createRelation(msg._id, idProposer, 'requested', function(contactData){
                if (contactData){
                    websockets.clients().forEach(function(socketContact){
                        socketContact.get('id', function(err, idContact){
                            if (err)
                                throw err;
                            if (idContact === msg._id){
                                socketContact.emit('contacts:update', contactData);
                            }
                        });
                    });
                }
            });
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
                socket.get('id', function(error, idUser){
                    if (!error && idUser){
                        CalendarEvent.getUserEvents(idUser, function(data){
                            console.log(data);
                            socket.emit('calendar:getEvents', data);
                        });
                    }
                });
            }
        });
    });

    socket.on('calendar:removeUser', function (msg){
        console.log('calendar:removeUser');
        console.log('id: '+msg.id);
        socket.get('id', function(error, idUser){
            if (!error && idUser){
                CalendarEvent.findById(msg.id, function(error, event){
                    event.delUser(idUser, function(){
                        CalendarEvent.getUserEvents(idUser, function(data){
                            console.log(data);
                            socket.emit('calendar:getEvents', data);
                        });
                    });
                });
            }
        });
    });

    socket.on('calendar:getEvents', function(msg){
        console.log('calendar:getEvents');
        socket.get('id', function(error, idUser){
            if (!error && idUser){
                CalendarEvent.getUserEvents(idUser, function(data){
                    socket.emit('calendar:getEvents', data);
                });
            }
        });
    });

    socket.on('disconnect', function () {
        socket.set('status', 'OFFLINE');
        socket.get('id', function(error, id){
            if (!error){
                notifyDisconnectionToContacts(id, socket);
                socket.leave(id);
            }
            else{
                console.log('unknown user disconnected');
            }
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
        socket.get(paramName, function(err, idProposer){
            if (!err && idProposer) {
                if (callback) callback(idProposer);
            }
        });
    }

    function findContactSocketById(currentUserId, contactId, callback) {
        var clients = (currentUserId === null)
            ? websockets.clients()
            : websockets.clients(currentUserId);

        clients.forEach( function(socket) {
            getSocketProperty(socket, 'id', function (socketId) {
                if (socketId === contactId){
                    if (callback) callback(socket);
                }
            });
        });
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
        getSocketProperty(sourceSocket, 'id', function (id){
            getSocketProperty(sourceSocket, 'status', function (status){
                destinationSocket.emit('roster:update', {id: id, status: status})
            });
        });
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
        socket.get('id', function(err, id){
            if (!err && id){
                User.findById(id, 'username name firstSurname lastSurname thumbnail email', function(error, user){
                    if (!error && user){
                        websockets.clients('call:'+msg.idCall).forEach(function(contact){
                            contact.get('id', function(errId, idContact){
                                if (!errId && idContact){
                                    if (idContact === msg.idUser){
                                        contact.emit('call:userDetails', user);
                                    }
                                }
                            });
                        });
                    }
                });
            }
        });
    });


    socket.on('call:hangup', function (msg){
        console.log('call:hangup, Room id: '+msg.id);
        var rooms = websockets.manager.roomClients[socket.id];
        console.log(rooms);
    });

    socket.on('webrtc:offer', function(msg){
        console.log('webrtc:offer');
        socket.get('id', function(err, id){
            if (!err && id){
                websockets.clients('call:'+msg.idCall).forEach(function(contact){
                    contact.get('id', function(errContact, idContact){
                        if (!errContact && idContact){
                            if (idContact === msg.idUser){
                                contact.emit(id+':offer', msg.offer);
                            }
                        }
                    });
                });
            }
        });
    });

    socket.on('webrtc:answer', function(msg){
        console.log('webrtc:answer');
        socket.get('id', function(err, id){
            if (!err && id){
                websockets.clients('call:'+msg.idCall).forEach(function(contact){
                    contact.get('id', function(errContact, idContact){
                        if (!errContact && idContact){
                            if (idContact === msg.idUser){
                                contact.emit(id+':answer', msg.answer);
                            }
                        }
                    });
                });
            }
        });
    });

    socket.on('webrtc:iceCandidate', function(msg){
        console.log('webrtc:iceCandidate');
        socket.get('id', function(err, id){
            if (!err && id){
                websockets.clients('call:'+msg.idCall).forEach(function(contact){
                    contact.get('id', function(errContact, idContact){
                        if (!errContact && idContact){
                            if (idContact === msg.idUser){
                                contact.emit(id+':iceCandidate', msg.candidate);
                            }
                        }
                    });
                });
            }
        });
    });
};

module.exports = function(sockets){
    websockets = sockets;
    return ws;
};
