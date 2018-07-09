//  Load 
var express = require('express'),
    app     = express(),
    morgan  = require('morgan'),
    http = require('http'),
    https = require('https'),
    fs = require('fs'),
    querystring = require('querystring');


var bible_reader_file = 'bible_reader.html';
var bible_reader;
fs.readFile(bible_reader_file, 'utf8', function (err,data) {
  if (err) { return console.log(err); }
  bible_reader = data;
  console.log('Loaded '+bible_reader_file);
});


    
Object.assign=require('object-assign')

app.engine('html', require('ejs').renderFile);
app.use(morgan('combined'))

var port = process.env.PORT || process.env.OPENSHIFT_NODEJS_PORT || 8080,
    ip   = process.env.IP   || process.env.OPENSHIFT_NODEJS_IP || '0.0.0.0',
    mongoURL = process.env.OPENSHIFT_MONGODB_DB_URL || process.env.MONGO_URL,
    mongoURLLabel = "";

if (mongoURL == null && process.env.DATABASE_SERVICE_NAME) {
  var mongoServiceName = process.env.DATABASE_SERVICE_NAME.toUpperCase(),
      mongoHost = process.env[mongoServiceName + '_SERVICE_HOST'],
      mongoPort = process.env[mongoServiceName + '_SERVICE_PORT'],
      mongoDatabase = process.env[mongoServiceName + '_DATABASE'],
      mongoPassword = process.env[mongoServiceName + '_PASSWORD']
      mongoUser = process.env[mongoServiceName + '_USER'];

  if (mongoHost && mongoPort && mongoDatabase) {
    mongoURLLabel = mongoURL = 'mongodb://';
    if (mongoUser && mongoPassword) {
      mongoURL += mongoUser + ':' + mongoPassword + '@';
    }
    // Provide UI label that excludes user id and pw
    mongoURLLabel += mongoHost + ':' + mongoPort + '/' + mongoDatabase;
    mongoURL += mongoHost + ':' +  mongoPort + '/' + mongoDatabase;

  }
}
var db = null,
    dbDetails = new Object();

var initDb = function(callback) {
  if (mongoURL == null) return;

  var mongodb = require('mongodb');
  if (mongodb == null) return;

  mongodb.connect(mongoURL, function(err, conn) {
    if (err) {
      callback(err);
      return;
    }

    db = conn;
    dbDetails.databaseName = db.databaseName;
    dbDetails.url = mongoURLLabel;
    dbDetails.type = 'MongoDB';

    console.log('Connected to MongoDB at: %s', mongoURL);
  });
};

app.get('/', function (req, res) {
  // try to initialize the db on every request if it's not already
  // initialized.
  if (!db) {
    initDb(function(err){});
  }
  if (db) {
    var col = db.collection('counts');
    // Create a document with request IP and current time of request
    col.insert({ip: req.ip, date: Date.now()});
    col.count(function(err, count){
      if (err) {
        console.log('Error running count. Message:\n'+err);
      }
      res.render('index.html', { pageCountMessage : count, dbInfo: dbDetails });
    });
  } else {
    res.render('index.html', { pageCountMessage : null});
  }
});

app.get('/pagecount', function (req, res) {
  // try to initialize the db on every request if it's not already
  // initialized.
  if (!db) {
    initDb(function(err){});
  }
  if (db) {
    db.collection('counts').count(function(err, count ){
      res.send('{ pageCount: ' + count + '}');
    });
  } else {
    res.send('{ pageCount: -1 }');
  }
});


// Test GET request
app.get('/test', function (req, res) {
    res.send('<h1>test worked!</h1>');
});

// NET Bible API test
app.get('/netbibletest', function (req, res) {
    http.get('http://labs.bible.org/api/?passage=John%203:16&type=json', (resp) => {
      let data = '';
      // A chunk of data has been recieved.
      resp.on('data', (chunk) => {
        data += chunk;
      });
      // The whole response has been received. Print out the result.
      resp.on('end', () => {
        res.send(JSON.parse(data));
      });
    }).on("error", (err) => {
      console.log("Error: " + err.message);
    });
});

// NET Bible chapter REST API
app.get('/rest/:book/:chap', function (req, res) {
    http.get('http://labs.bible.org/api/?passage='+req.params.book+'%20'+req.params.chap+'&type=text&formatting=para', (resp) => {
      let data = '';
      // A chunk of data has been recieved.
      resp.on('data', (chunk) => {
        data += chunk;
      });
      // The whole response has been received. Print out the result.
      resp.on('end', () => {
        res.send(data);
      });
    }).on("error", (err) => {
      console.log("Error: " + err.message);
    });
});

// Any site -- remove href or src tags
app.get('/minimal_html/:site', function (req, res) {
	console.log("\nLoading: "+req.params.site);
    https.get('https://'+req.params.site, (resp) => {
      let data = '';
      // A chunk of data has been recieved.
      resp.on('data', (chunk) => {
        data += chunk;
      });
      // The whole response has been received. Print out the result.
      resp.on('end', () => {
      	data = data.replace(/<[^>]{7,}>/ig, (sub_string, p1, p2, p3, offset, string) => {
      		return '';
      	});
      	//console.log('-------------------------');
      	//console.log(data);
      	res.send(data);
      	//console.log('-------------------------');
      });
    }).on("error", (err) => {
      console.log("Error: " + err.message);
    });
});


// bible_reader.html
app.get('/bible_reader', function (req, res) {
	res.send(bible_reader);
});


// GETBIBLE convert JSON to plaintext
function convertGETBIBLE(json_object) {
	let text = '';
	if (json_object.book) {
		// Book-style result
		console.log('book object');
		console.log(json_object.book[0]);
		for (let verse in json_object.book[0].chapter) {
			text += '<b>'+verse+'</b> '+json_object.book[0].chapter[verse].verse+'<br>';
		}
	} else if (json_object.chapter) {
		// Chapter-style result
		for (let verse in json_object.chapter) {
			text += '<b>'+verse+'</b> '+json_object.chapter[verse].verse+'<br>';
		}
	} else {
		text = '<h1>Error: I don\'t recognize the object structure received from getbible.net/json</h1>';
	}
	return text;
}

// GETBIBLE api
app.get('/bibleapi/:query/:version', function (req, res) {
	let request = '/json?passage='+encodeURI(req.params.query)+'&version='+encodeURI(req.params.version);
	//let request = '/json?passage=Acts%2015:1-5,%2010,%2015&version=aov';
	console.log('Requesting: '+request);
    http.get(
    	{
		hostname: 'getbible.net',
		port: 80,
		path: request,
		method: 'GET',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			'User-Agent': 'javascript'
		}
  	},
  	(resp) => {
		let data = '';
		// A chunk of data has been recieved.
		resp.on('data', (chunk) => {
			data += chunk;
		});
		// The whole response has been received. Print out the result.
		resp.on('end', () => {
			try {
				let json_text = data.match(/({.*})/)[1];
				let json_object = JSON.parse(json_text);
				let converted_text = convertGETBIBLE(json_object);
				res.send(converted_text);
				//res.json(json_object);
			} catch (error) {
				console.log('Error while parsing returned JSON data: '+error);
				res.send('Not recognized. Try something like "Jn 1:1-12".');
			}
		});
	}).on("error", (err) => {
		console.log("Error: " + err.message);
	});
});



// error handling
app.use(function(err, req, res, next){
  console.error(err.stack);
  res.status(500).send('Something bad happened!');
});

initDb(function(err){
  console.log('Error connecting to Mongo. Message:\n'+err);
});

app.listen(port, ip);
console.log('Server running on http://%s:%s', ip, port);

module.exports = app ;
