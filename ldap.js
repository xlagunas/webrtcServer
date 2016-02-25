var ldap = require('ldapjs');
var client = ldap.createClient({
    url: 'ldap://ldap.i2cat.net:389'
});
var ldapFilter = {ou: 'ou=activat,ou=personal', dc: 'dc=i2cat,dc=net'}



exports.ldapLogin = function(username, password, callback) {
    var opts = {
        filter: '(&(objectclass=person)(uid='+username+'))',
        scope: 'sub'
    }
    client.search(ldapFilter.ou+','+ldapFilter.dc, opts, function(err, res){
        var dn;
        var user;

        if (err)
            console.log(err);

        res.on('searchEntry', function(entry) {
            dn = entry.objectName;
            user = {
                username: entry.object.uid,
                name: entry.object.givenName,
                firstSurname: entry.object.sn,
                lastSurname: entry.object['x-cognom2'],
                email: entry.object.mail
            }
        });

        res.on('searchReference', function(referral) {
            console.log('referral: ' + referral.uris.join());
        });

        res.on('error', function(err) {
            console.error('error: ' + err.message);
            if (callback)
                callback({status: 'error', msg: 'Error generic en català per controlar'});
        });

        res.on('end', function(result) {
            console.log('status: ' + result.status);
            if(dn){
                client.bind(dn, password, function(error){
                    if (error){
                        console.log(error.dn);
                        console.log(error.code);
                        console.log(error.name);
                        console.log(error.message);
                        if (callback)
                            callback({status: 'error', msg:error.message});
                    }
                    else{
                        if (callback)
                            callback({status: 'success', user: user});
                    }
                });
            }
            else{
                if (callback)
                    callback({status: 'error', msg: 'User not found in LDAP directory'});
            }
        });
    });
}

exports.existsLdap = function(username, callback) {
    var opts = {
        filter: '(&(objectclass=person)(uid='+username+'))',
        scope: 'sub'
    }
    client.search(ldapFilter.ou+','+ldapFilter.dc, opts, function(err, res){
        var dn;

        if (err)
            console.log(err);

        res.on('searchEntry', function(entry) {
            dn = entry.objectName;
        });

        res.on('error', function(err) {
            console.error('error: ' + err.message);
            if (callback)
                callback({status: 'error', msg: 'Error generic en català per controlar'});
        });

        res.on('end', function(result) {
            if(dn){
                callback(true);
            }
            else{
                callback(false);
            }
        });
    });
}

