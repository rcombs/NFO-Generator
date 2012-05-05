#! /usr/bin/env node

// Load libraries
var http = require("http"),
	fs = require("fs"),
	rl = require('readline'),
	path = require("path"),
	mediainfo = require("mediainfo"),
	request = require("request"),
	mime = require("mime"),
	nomnom = require("nomnom"),
	child_process = require('child_process');
	
// API keys and URL paths
var	THETVDB_API_KEY = "88445D4B8F5F27A3",
	TMDB_API_KEY = "5261508c7eb4c0ea4a7c335c8d8e2074",
	THETVDB_API_PATH = "http://www.thetvdb.com/api/",
	TMDB_API_PATH = "http://api.themoviedb.org/2.1/%/en/xml/" + TMDB_API_KEY + "/";
	
// Detect Windows
var isWin = process.platform === 'win32';
	
// Set some constants
var MOVIE = "M",
	TV = "T",
	ABSOLUTE = "A";

// Set up the regex for matching TV shows.
var TVTitleRegex = /(?:\s|-)(?:(?:S([0-9]{2,})E([0-9]{2,})\b)|(?:([0-9]+)x([0-9]{2,}))|(?:EP([0-9]{2,}))|([0-9]{3}))\b/i;
var MovieTitleRegex = /(\b-\b)|((?:\s)((\(?[0-9]{4}\)?)|4K|2K|1080p|720p|480p|360p|SD|MKV|X264|H264|H\.264|XVID|AC3|AAC|MKV|MP4|AVI|BluRay|Blu-Ray|BRRIP|DVDRip|DVD|DVDR|DVD-R|R[1-9]|HDTV|HDRip|HDTVRip|DTVRip|DTV|TS|TSRip|CAM|CAMRip|ReadNFO|iNTERNAL))(\b)/i;

process.title = "NFOMaker";

// Parse arguments with nomnom
var parsedOpts = nomnom
		.script("makeNFO")
		.options({
			path: {
				position: 0,
				help: "File to generate an NFO for",
				list: false,
				required: true
			},
			output: {
				position: 1,
				help: 'File to save the NFO to. Default is the name of the input file with the extension replaced with "nfo". Set to "-" to write to stdout.',
				list: false,
				required: false
			},
			noGuess: {
				abbr: "N",
				full: "no-guess",
				flag: true,
				help: "Don't try to guess; ask about everything"
			},
			noInput: {
				abbr: "u",
				full: "no-ui",
				flag: true,
				help: "Don't ask about things; bug out if something can't be guessed"
			},
			type: {
				abbr: "t",
				help: "Type of video (either Movie or TV)",
				choices: ["TV", "Movie"],
				required: false
			},
			name: {
				abbr: "n",
				help: "Name of the movie or TV show to search for"
			},
			year: {
				abbr: "y",
				help: "Original release year of the video"
			},
			source: {
				abbr: "s",
				help: "Source RG of the video (OPTIONAL). If specified, they will be credited."
			},
			user: {
				abbr: "u",
				help: "Username to add to the title (OPTIONAL)"
			},
			id: {
				abbr: "i",
				help: "IMDB movie or TheTVDB episode ID (including tt if it's an IMDB ID)"
			},
			seriesID: {
				full: "series-id",
				abbr: "I",
				help: "TheTVDB series ID"
			},
			episode: {
				abbr: "e",
				help: "Episode to search for. Formats are: S01E01 and 1x01 for season/episode; EP001 and 001 for absolute numbering. 101 will NOT match S01E01."
			}
		})
		.parse();

// Setup an object to store options and meta that have been parsed and checked
var opts = {};

// Function to bug out in errors
function errorDie(message){
	console.error(message);
	process.exit(1);
}

// The path should always be right; it's required
opts.path = parsedOpts.path;

// Bug out if the file doesn't exist
if(!path.existsSync(opts.path)){
	errorDie('The file "' + opts.path + '" doesn\'t exist!');
}

// Set the output file to <mediafilename>.nfo if it's not given.
opts.output = parsedOpts.output || path.dirname(opts.path) + "/" + path.basename(opts.path, path.extname(opts.path)) + ".nfo";

// Create the file write stream. If the output path is "-", use stdout. Otherwise, write to the filesystem.
var outStream;
if(opts.output == "-"){
	outStream = process.stdout;
}else{
	outStream = fs.createWriteStream(opts.output, {mode: 755});
	outStream.on("error", function(error){
		if(error.code == "EACCES"){
			errorDie("Could not write to output file: \"" + opts.output + "\" (access denied)!");
		}else{
			errorDie("Error writing to output file: \"" + opts.output + "\" (Code " + error.code + ")!");
		}
	});
}

// Get the file's basename, remove the extension, and replace "." with " "
var basename = path.basename(opts.path, path.extname(opts.path)).replace(/\./g, " ");

// Initiate readline interface (use stderr, as stdout may be used for output)
var i = rl.createInterface(process.stdin, process.stderr, null);

// If close is called, clean up interfaces and exit with code 0.
function close(){
	// These two lines together allow the program to terminate. Without
	// them, it would run forever.
	i.close();
	process.stdin.destroy();
	outStream.end();
	process.exit(0);
}

// If an external ID was provided, use it!
if(parsedOpts.id){
	opts.id = parsedOpts.id;
	if(parsedOpts.id.indexOf("tt") == 0){
		opts.type = MOVIE;
		searchTMDB();
	}else{
		opts.type = TV;
		searchTVDB();
	}
}else if(parsedOpts.seriesID){
	// Series IDs are the next-best thing. Use them, then guess the episode number.
	opts.type = TV;
	opts.seriesID = parsedOpts.seriesID;
	getEpisode();
}else if(parsedOpts.type){
	// No ID, but at least we have a media type. Moving on!
	opts.type = parsedOpts.type;
	getName();
}else{
	// If the type isn't specified, guess with a regex; if that fails, ask the user.
	if(parsedOpts.noGuess){
		if(parsedOpts.noInput){
			errorDie("Can't guess the media type, and input isn't allowed!");
		}else{
			var ask = function(){
				i.question("What type of media is the file? [TV or Movie]", function(type){
					if(["tv", "movie"].indexOf(type.toLowerCase()) == -1){
						console.error("Please answer either TV or Movie!");
						ask();
					}else{
						if(type.toLowerCase() == "tv"){
							opts.type = TV;
						}else{
							opts.type = MOVIE;
						}
						getName();
					}
				});
			}
			ask();
		}
	}else{
		if(basename.search(TVTitleRegex) != -1){
			opts.type = TV;
			getName();
		}else{
			opts.type = MOVIE;
			getName();
		}
	}
}

// Guess the name of a TV show or movie based on its filename (RISKY!).
// Return false if we can't guess.
function guessName(name, type){
	if(type == "TV"){
		// Match everything before the episode number
		return basename.substring(0, basename.search(TVTitleRegex));
	}else{
		// Match everything before one of a set of red flags for movie titles. They're all good indicators, but it's not 100% accurate.
		var index = basename.search(MovieTitleRegex);
		if(index == -1){
			// No indicators. We did our best, but it's time to ask the user.
			return false;
		}
		return basename.substring(0, index);
	}
}

// Guess or ask for the series/movie name
function getName(){
	if(parsedOpts.name){
		// Name was provided; move on!
		opts.name = parsedOpts.name;
		if(opts.type == "TV"){
			getEpisode();
		}else{
			searchTMDB();
		}
	}else{
		// Name wasn't provided; Guess or ask.
		var ask = function(){
			i.question("What is the name of the TV show or movie? ", function(name){
				if(name.length == 0){
					console.error("Please enter a name!");
					ask();
				}else{
					opts.name = name;
					if(opts.type == "TV"){
						getEpisode();
					}else{
						searchTMDB();
					}
				}
			});
		}
		if(parsedOpts.noGuess){
			// Guessing isn't allowed...
			if(parsedOpts.noInput){
				// You dumbass.
				errorDie("Can't guess the media name, and input isn't allowed!");
			}else{
				// No guessing; ask the user.
				ask();
			}
		}else{
			// Take your best guess based on the name and the type.
			var guess = guessName(basename, opts.type);
			if(guess){
				opts.name = guess;
				if(opts.type == "TV"){
					getEpisode();
				}else{
					searchTMDB();
				}
			}else{
				if(parsedOpts.noInput){
					errorDie("Can't guess the media name, and input isn't allowed!");
				}else{
					// Ask the user if possible.
					ask();
				}
			}
		}
	}
}

// Guess or ask for the episode and season numbers
function getEpisode(){
	var ask = function(){
		i.question("What episode is the file? Formats are: S01E01 and 1x01 for season/episode; EP001 and 001 for absolute numbering. 101 will NOT match S01E01.", function(episode){
			parseEpisode(episode);
		});
	}
	var parseEpisode = function(string){
		var matches = string.match(TVTitleRegex);
		var numbers = [];
		for(var i = 1; i < matches.length; i++){
			if(matches[i]){
				numbers.push(matches[i]);
			}
		}
		if(numbers.length > 2){
			errorDie("WTF is this? Episode number is badly mangled.");
		}else if(numbers.length == 2){
			opts.season = parseInt(numbers[0], 10);
			opts.episode = parseInt(numbers[1], 10);
			searchTVDB();
		}else if(numbers.length == 1){
			opts.season = ABSOLUTE;
			opts.episode = parseInt(numbers[0], 10);
			searchTVDB();
		}else{
			if(parsedOpts.noInput){
				errorDie("Can't parse episode and input isn't allowed!");
			}else{
				console.error("Please enter a valid episode number.");
				ask();
			}
		}
	}
	if(parsedOpts.episode){
		parseEpisode(" " + parsedOpts.episode);
	}else if(parsedOpts.noGuess){
		if(parsedOpts.noInput){
			die("Can't guess episode and input isn't allowed!");
		}else{
			ask();
		}
	}else{
		parseEpisode(basename);
	}
}

// Search TMDB for a movie
function searchTMDB(){
	//DEBUG!
	takeAndUploadScreenshots(opts.path, 60, false, 2, function(data){
		console.log(data);
	}, function(){
		console.log(arguments);
	});
}

// Upload some data to Lookpic.
/*
	data: data to upload
	type: MIME type of data
	resize: Lookpic resize type, or -1 to not resize
	callback: Callback function; takes a posted image URL as an argument
*/
function uploadLookpic(data, type, resize, callback){
	request.post({
		url: "http://lookpic.com/upload.php",
		multipart: [
			{body: data, "Content-Type": type, "Content-Disposition": 'form-data; name="image"; filename="image.png"'},
			{body: "5000000", "Content-Disposition": 'form-data; name="MAX_FILE_SIZE"'},
			{body: Math.max(resize, 0).toString(10), "Content-Disposition": 'form-data; name="resize"'},
			{body: ((resize != -1) + 0).toString(10), "Content-Disposition": 'form-data; name="stat_resize"'},
			{body: "Upload", "Content-Disposition": 'form-data; name="submit"'}
		],
		headers: {
			"Content-Type": "multipart/form-data",
			"Origin": "http://lookpic.com",
			"Referer": "http://lookpic.com/",
			"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
		}
	}, function(err, res, body){
		if(err){
			throw(err);
		}else{
			console.log(body);
			callback(body.match(/\[IMG\](.*)\[\/IMG\]/i)[1]);
		}
	});
}

// Take a PNG screenshot of a file and send it to a callback
/*
	path: path of the file to screenshot
	time: time (hh:mm:ss) to take the screenshot at
	size: frame size, either WxH or W*H (default to the size of the video)
	callback: called after the screenshot is taken with the data as an argument
*/
function takeScreenshot(path, time, size, callback){
	if(!time){
		time = '00:00:01';
	}
	if(!size){
		size = '';
	}else{
		size = ' -s ' + size.replace("x", "*");
	}
	console.log('ffmpeg -i ' + path + ' -ss ' + time + ' -vframes 1 -y' + size + ' -vcodec png -f image2 -');
	return child_process.exec('ffmpeg -i ' + path + ' -ss ' + time + ' -vframes 1 -y' + size + ' -vcodec png -f image2 -', {
		encoding: 'binary',
		maxBuffer: 100000000*1024
	}, function(error, data) {
		if(error){
			throw(error);
		}else if(callback) {
			callback(data);
		}
	});
}

// Takes a screenshot and uploads it to Lookpic.
/*
	path: Path of file to take the screenshot from
	time: timecode (hh:mm:ss) to take the screenshot at
	size: frame size, either WxH or W*H (default to the size of the video)
	callback: called after the upload finishes with the image URL as an argument
*/
function takeAndUploadScreenshot(path, time, size, callback){
	takeScreenshot(path, time, size, function(data){
		uploadLookpic(data, "image/png", -1, callback);
	});
}

/**
 * Returns a random integer between min and max
 * Using Math.round() will give you a non-uniform distribution!
 * | 0 is used as a faster replacement for Math.floor
 */
function getRandomInt (min, max) {
    return ((Math.random() * (max - min + 1)) | 0) + min;
}

// Pads a number to 2 digits (for H:M:S)
function pad(number, len){
	var str = number.toString(10);
	while(str.length < len){
		str = "0" + str;
	}
	return str;
}

// Converts a seconds value to HH:MM:SS notation. | 0 is used as a faster replacement for Math.floor
function secondsToHHMMSS(seconds){
	var h, m, s;
	s = seconds % 60;
	m = ((seconds / 60) | 0) % 60;
	h = ((seconds / 60) / 60) | 0;
	return pad(h, 2) + ":" + pad(m, 2) + ":" + pad(s, 2);
}

// Takes and uploads screenshots at random points in the file. | 0 is used as a faster replacement for Math.floor
/*
	path: Path to take screenshots from
	duration: Duration of the video file (in seconds)
	size: Frame size, either WxH or W*H (default to the size of the video)
	count: How many screenshots to take
	callback: Function to call after all screenshots have been taken and uploaded (takes an array of URLs as an argument)
	progressCallback: Function to call after each screenshot finishes uploading (takes 3 arguments: number of screenshots finished, total, and new URL)
*/
function takeAndUploadScreenshots(path, duration, size, count, callback, progressCallback){
	var screenshotURLs = [];
	var start = 0, increment = duration/count | 0, end = increment;
	for(var i = 0; i < count; i++){
		takeAndUploadScreenshot(path, secondsToHHMMSS(getRandomInt(start, end)), false, function(URL){
			screenshotURLs.push(URL);
			if(screenshotURLs.length == count){
				callback(screenshotURLs);
			}else if(progressCallback){
				progressCallback(screenshotURLs.length, count, URL);
			}
		});
		i++;
		start = end;
		end += increment;
	}
}