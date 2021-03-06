/*jshint node: true */

'use strict';

var router = require('express').Router();
var four0four = require('./utils/404')();
var http = require('http');
var config = require('../gulp.config')();


var options = {
  appPort: process.env.APP_PORT || config.defaultPort,
  mlHost: process.env.ML_HOST || config.marklogic.host,
  mlPort: process.env.ML_PORT || config.marklogic.port,
  defaultUser: config.marklogic.user,
  defaultPass: config.marklogic.password
};

router.get('/user/status', function(req, res) {
  if (req.session.user === undefined) {
    res.send('{"authenticated": false}');
  } else {
    res.send({
      authenticated: true,
      username: req.session.user.name,
      profile: req.session.user.profile
    });
  }
});

router.post('/user/login', function(req, res) {
  // Attempt to read the user's profile, then check the response code.
  // 404 - valid credentials, but no profile yet
  // 401 - bad credentials
  var username = req.body.username;
  var password = req.body.password;
  var headers = req.headers;
  // remove content length so ML doesn't wait for request body
  // that isn't being passed.
  delete headers['content-length'];
  var login = http.get({
    hostname: options.mlHost,
    port: options.mlPort,
    path: '/v1/documents?uri=/users/' + username + '.json',
    headers: headers,
    auth: username + ':' + password
  }, function(response) {
    if (response.statusCode === 401) {
      res.statusCode = 401;
      res.send('Unauthenticated');
    } else if (response.statusCode === 404) {
      // authentication successful, but no profile defined
      req.session.user = {
        name: username,
        password: password
      };
      res.send(200, {
        authenticated: true,
        username: username
      });
    } else {
      console.log('code: ' + response.statusCode);
      if (response.statusCode === 200) {
        // authentication successful, remember the username
        req.session.user = {
          name: username,
          password: password
        };
        response.on('data', function(chunk) {
          var json = JSON.parse(chunk);
          if (json.user !== undefined) {
            req.session.user.profile = {
              fullname: json.user.fullname,
              emails: json.user.emails
            };
            res.send(200, {
              authenticated: true,
              username: username,
              profile: req.session.user.profile
            });
          } else {
            console.log('did not find chunk.user');
          }
        });
      }
    }
  });

  login.on('error', function(e) {
    console.log(JSON.stringify(e));
    console.log('login failed: ' + e.statusCode);
  });
});

router.get('/user/logout', function(req, res) {
  delete req.session.user;
  res.send();
});

router.get('/*', four0four.notFoundMiddleware);

module.exports = router;
