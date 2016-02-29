/**
 * Created with JetBrains WebStorm.
 * User: xlagunas
 * Date: 03/02/14
 * Time: 09:48
 * To change this template use File | Settings | File Templates.
 */


var Mongoose = require('mongoose'),
    _ = require('underscore'),
    ldap = require('./ldap');

var userSchema = Mongoose.Schema(
    {
        username: {type: String, index: true, unique: true, required: true},
        name: String,
        firstSurname: String,
        lastSurname: String,
        email: {type: String, required: true},
        status: {type: String, default: 'OFFLINE'},
        password: {type: String, required: false},
        accepted: [{ type : Mongoose.Schema.ObjectId, ref : 'User' }],
        pending: [{ type : Mongoose.Schema.ObjectId, ref : 'User'  }],
        blocked: [{ type : Mongoose.Schema.ObjectId, ref : 'User' }],
        requested: [{ type : Mongoose.Schema.ObjectId, ref : 'User' }],
        joinDate: {type: Date, default: Date.now()},
        thumbnail: {type: String, default: 'profile.png'},
        isLdap: Boolean
    }
);

userSchema.virtual('updatedStatus')
    .get( function () {
        if (!this.currentStatus)
            return 'OFFLINE';
        return this.currentStatus;
    }).set(function(v){
        this.currentStatus = v;
    });

userSchema.set('toJSON', { getters: true, virtuals: true });

userSchema.statics.login = function(username, password, callback){
    this.findOne({username: username})
        .populate('pending accepted requested blocked')
        .exec(function(error, user){
            if (!error){
                if (!user){
                    console.log('User not in db, checking ldap');
                    ldap.ldapLogin(username, password, function(data){
                        if (data.status === 'error'){
                            callback({status: 'error', msg: 'user not found'});
                        }
                        else{
                            data.user.isLdap = true;
                            User.create(data.user, function(error, newLdapUser){
                                if (!error){
                                    console.log('new ldapUser has been created');
                                    callback({status: 'success', user: newLdapUser});
                                }else{
                                    console.log(error);
                                }
                            });
                        }
                    });
                }
                else{
                    if (user && user.isLdap){
                        ldap.ldapLogin(username, password, function(data){
                            console.log('validating ldap user');
                            if (data.status === 'error'){
                                console.log('ldap user error');
                                callback({status: 'error', msg: 'password doesn\'t match'});
                            }
                            else{
                                console.log('ldap successfull authentication:)')
                                callback({status: 'success', user: user});
                            }
                        });
                    }
                    else{
                        if (user.password === password){
                            callback({status: 'success', user: user});
                        }
                        else{
                            callback({status: 'error', msg: 'password doesn\'t match'})
                        }
                    }
                }
            }
        });
};

userSchema.statics.findByUsername = function(username, cb){
    this.findOne({username: username}, cb);
};

userSchema.statics.findMatchingUsers = function(matchingUsername, callback){
    this
        .find({username:  new RegExp(matchingUsername, "i")})
        .select("-pending -password -accepted -requested -blocked")
        .exec(function(error, users){
            if (!error){
                callback(users);
            }
        });
};

userSchema.statics.swapRelation = function (idUser, idContact, currentStatus, futureStatus, callback){
    this.findById(idUser, function(error, user){
        if (!error){
            if (user){
                user.changeRelationStatus(currentStatus,futureStatus, idContact, callback);
            }
        }
    });
};

userSchema.statics.swapUserRelation = function(user, idContact, currentStatus, futureStatus, callback){
    user.changeRelationStatus(currentStatus, futureStatus, idContact, callback);
};

userSchema.statics.createRelation = function(idProposer, idContact, status, callback){
    this.findById(idProposer, function(error, user){
        if (error)
            callback(error);
        else {
            userSchema.statics.createUserRelation(user, idContact, status, callback);
        }
    });
};

userSchema.statics.createUserRelation = function(user, idContact, status, callback){
  user[status].addToSet(idContact);
  user.save(function(error, savedUser){
      if (error) {
          callback(error);
      } else if (savedUser) {
          User.populate(savedUser,
              {  path: 'pending accepted requested blocked',
                  select: 'name username firstSurname lastSurname email thumbnail'
              }
              ,function(error, populatedData){
                  if (!error && populatedData){
                      callback({
                          accepted:   populatedData.accepted,
                          requested:  populatedData.requested,
                          pending:    populatedData.pending,
                          blocked:    populatedData.blocked
                      });
                  } else
                      callback(error);
              });
      }
  });
};

userSchema.statics.listContacts = function(id, callback){
    this
        .findById(id)
        .exec(function(error, populatedData){
            if (!error && populatedData){
                userSchema.statics.listUserContacts(populatedData, callback);
            }
        });
};

userSchema.statics.listUserContacts = function(user, callback) {
    User.populate(user,
        { path: 'pending accepted requested blocked',
            select: 'name username firstSurname lastSurname email thumbnail'},
        function(error, populatedData){
            if (error){
                callback(error);
            }
            else {
                callback(null, {
                    accepted:   populatedData.accepted,
                    requested:  populatedData.requested,
                    pending:    populatedData.pending,
                    blocked:    populatedData.blocked
                });
            }
        });
};

userSchema.statics.exists = function(username, callback){
    this.findOne({username: username}, function(error, user){
        if (!error){
            if (user)
                return callback(true);
            else{
                ldap.existsLdap(username,callback);
            }

        }else{
            return callback(false);
        }
    });
};

userSchema.methods.changeRelationStatus = function(oldStatus, newStatus, userId, callback){
    console.log('Changing relationship Status!');

    if (this[oldStatus].indexOf(userId) != -1) {
        this[oldStatus].pull(userId);
        this[newStatus].addToSet(userId);

        this.save(function (error, savedUser, numModified) {
            console.log('savedUser: ' + savedUser);
            if (error){
                callback(error, null);
            } else {
                User.populate(savedUser,
                    {
                        path: 'pending accepted requested blocked',
                        select: 'name username firstSurname lastSurname email thumbnail'
                    },
                    callback);
            }
        });

    } else {
        console.log('Couldn\'t change relationship status bc no oldRelation with the user was found!');
        callback("error", null);
    }

};

var User = Mongoose.model('User', userSchema);
exports.User = User;
