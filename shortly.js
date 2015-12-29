var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');
var session = require('express-session');
var bcrypt = require('bcrypt-nodejs');
var GitHubStrategy = require('passport-github2').Strategy;
var passport = require('passport');

var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');

//passport configuration
var GITHUB_CLIENT_ID = "23c15712fbb4e5e7d635";
var GITHUB_CLIENT_SECRET = "23f72a3e9d78ed8101b25025072acca258aae018";
// Passport session setup.
//   To support persistent login sessions, Passport needs to be able to
//   serialize users into and deserialize users out of the session.  Typically,
//   this will be as simple as storing the user ID when serializing, and finding
//   the user by ID when deserializing.  However, since this example does not
//   have a database of user records, the complete GitHub profile is serialized
//   and deserialized.
passport.serializeUser(function(user, done) {
  done(null, user);
});
passport.deserializeUser(function(obj, done) {
  done(null, obj);
});
// Use the GitHubStrategy within Passport.
//   Strategies in Passport require a `verify` function, which accept
//   credentials (in this case, an accessToken, refreshToken, and GitHub
//   profile), and invoke a callback with a user object.
passport.use(new GitHubStrategy({
    clientID: GITHUB_CLIENT_ID,
    clientSecret: GITHUB_CLIENT_SECRET,
    callbackURL: "http://localhost:4568/auth/github/callback"
  },
  function(accessToken, refreshToken, profile, done) {
    // asynchronous verification, for effect...
    process.nextTick(function () {
      
      // To keep the example simple, the user's GitHub profile is returned to
      // represent the logged-in user.  In a typical application, you would want
      // to associate the GitHub account with a user record in your database,
      // and return that user instead.
      return done(null, profile);
    });
  }
));

var app = express();

//express sessions
app.use(session({
  secret: "you are cat",
  resave: false,
  saveUninitialized: true
}));

// Initialize Passport!  Also use passport.session() middleware, to support
// persistent login sessions (recommended).
app.use(passport.initialize());
app.use(passport.session());

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(express.static(__dirname + '/public'));

app.get('/', util.ensureAuthenticated, function(req, res) {
  res.render('index', {user: req.user});
});

app.get('/create', util.ensureAuthenticated,
  function(req, res) {
    res.render('index');
  });

app.get('/links', util.ensureAuthenticated,
  function(req, res) {
    Links.reset().fetch().then(function(links) {
      res.send(200, links.models);
    });
  });

app.post('/links', util.ensureAuthenticated,
  function(req, res) {
    var uri = req.body.url;

    if (!util.isValidUrl(uri)) {
      console.log('Not a valid url: ', uri);
      return res.send(404);
    }

    new Link({
      url: uri
    }).fetch().then(function(found) {
      if (found) {
        res.send(200, found.attributes);
      } else {
        util.getUrlTitle(uri, function(err, title) {
          if (err) {
            console.log('Error reading URL heading: ', err);
            return res.send(404);
          }

          var link = new Link({
            url: uri,
            title: title,
            base_url: req.headers.origin
          });

          link.save().then(function(newLink) {
            Links.add(newLink);
            res.send(200, newLink);
          });
        });
      }
    });
  });

/************************************************************/
// Write your authentication routes here
/************************************************************/

app.get('/login', function(req, res) {
  res.render('login');
});

app.get('/signup', function(req, res) {
  res.render('signup');
});

// app.post('/login', function(req, res) {
//   var username = req.body.username;
//   var password = req.body.password;

//   new User({
//     'username': username
//   }).fetch().then(function(user) {
//     if (!user) {
//       res.redirect('/login');
//     } else {
//       // compare the passwords
//       bcrypt.compare(password, user.password, function(err, result) {
//         if (err) console.log(err);
//         // handle the session
//         // if true, create session, so user doesn't have to login again
//         req.session.regenerate(function() {
//           req.session.user = username;
//           res.redirect('/');
//         });
//       });
//     }
//   });
// });

// app.post('/signup', function(req, res) {
//   var username = req.body.username;
//   var password = req.body.password;

//   new User({
//     'username': username
//   }).fetch().then(function(user) {
//     if (!user) {
//       bcrypt.hash(password, null, null, function(err, hash) {
//         if (err) console.log(err);
//         var user = new User({
//           username: username,
//           password: hash
//         });
//         user.save().then(function() {
//           req.session.regenerate(function() {
//             req.session.user = username;
//             res.redirect('/');
//           });
//         });
//       });
//     } else { 
//       res.redirect('/signup');
//     }
//   });
// });

// app.get('/logout', function(req, res) {
//   req.session.destroy(function(err) {
//     res.redirect('/login');
//   });
// });

// GET /auth/github
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  The first step in GitHub authentication will involve redirecting
//   the user to github.com.  After authorization, GitHub will redirect the user
//   back to this application at /auth/github/callback
app.get('/auth/github',
  passport.authenticate('github', { scope: [ 'user:email' ] }),
  function(req, res){
    // The request will be redirected to GitHub for authentication, so this
    // function will not be called.
  });

// GET /auth/github/callback
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  If authentication fails, the user will be redirected back to the
//   login page.  Otherwise, the primary route function will be called,
//   which, in this example, will redirect the user to the home page.
app.get('/auth/github/callback', 
  passport.authenticate('github', { failureRedirect: '/login' }),
  function(req, res) {
    res.redirect('/');
  });

app.get('/logout', function(req, res){
  req.logout();
  res.redirect('/');
});

/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({
    code: req.params[0]
  }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        link_id: link.get('id')
      });

      click.save().then(function() {
        db.knex('urls')
          .where('code', '=', link.get('code'))
          .update({
            visits: link.get('visits') + 1,
          }).then(function() {
            return res.redirect(link.get('url'));
          });
      });
    }
  });
});

console.log('Shortly is listening on 4568');
app.listen(4568);
