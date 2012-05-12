#! /usr/bin/env node

// Load libraries
var http = require("http"),
	fs = require("fs"),
	readline = require('readline'),
	path = require("path"),
	child_process = require('child_process'),
	querystring = require("querystring"),
	request = require("request"),
	mime = require("mime"),
	nomnom = require("nomnom"),
	xml2js = require("xml2js");
	
// API keys and URL paths
var	TVDB_API_KEY = "88445D4B8F5F27A3",
	TMDB_API_KEY = "5261508c7eb4c0ea4a7c335c8d8e2074",
	TVDB_API_PATH = "http://www.thetvdb.com/api/",
	TMDB_API_PATH = "http://api.themoviedb.org/2.1/%method%/%lang%/%type%/%key%/%arg%",
	LANGUAGE = "en";
	
var parser = new xml2js.Parser();
	
// Helper functions for TMDB and TVDB
function TMDBRequest(method, arg, callback){
	var url = TMDB_API_PATH.replace("%method%", method).replace("%lang%", LANGUAGE).replace("%type%", "json").replace("%key%", TMDB_API_KEY).replace("%arg%", arg);
	request({url: url}, function(error, response, body){
		callback(error, JSON.parse(body));
	});
}
function TVDBStaticRequest(path, callback){
	var url = TVDB_API_PATH + TVDBAPI_KEY + path;
	request({url: url}, function(error, response, body){
		if(error){
			callback(error, null);
		}else{
			parser.parseString(body, function(err, data){
				callback(err, data);
			});
		}
	});
}
function TVDBDynamicRequest(inf, args, callback){
	var url = TVDB_API_PATH + inf + ".php?" + querystring.stringify(args);
	request({url: url}, function(error, response, body){
		if(error){
			callback(error, null);
		}else{
			parser.parseString(body, function(err, data){
				callback(err, data);
			});
		}
	});
}
	
// Detect Windows
var isWin = process.platform === 'win32';
// Detect OSX
var isMac = process.platform === 'darwin';
	
// Set some constants
var MOVIE = "M",
	TV = "T",
	ABSOLUTE = "A";

// Set up the regex for matching TV shows.
var TVTitleRegex = /(?:\s|-)(?:(?:S([0-9]{2,})E([0-9]{2,})\b)|(?:([0-9]+)x([0-9]{2,}))|(?:EP([0-9]{2,}))|([0-9]{3}))\b/i;
var MovieTitleRegex = /(?:\b-\b)|(?:\s(?:(?:\(?([0-9]{4})\)?)|4K|2K|1080p|720p|480p|360p|SD|MKV|X264|H264|H\.264|XVID|AC3|AAC|MKV|MP4|AVI|BluRay|Blu-Ray|BRRIP|DVDRip|DVD|DVDR|DVD-R|R[1-9]|HDTV|HDRip|HDTVRip|DTVRip|DTV|TS|TSRip|CAM|CAMRip|ReadNFO|iNTERNAL))(?:\b)/i;

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
				help: "Source RG of the video (OPTIONAL). If specified, they will be credited.",
				default: ""
			},
			user: {
				abbr: "u",
				help: "Username to add to the title (OPTIONAL)",
				default: ""
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
			},
			snapshotCount: {
				abbr: "c",
				default: 4,
				full: "snapshot-count",
				help: "Number of snapshots to take of the video file (uploaded to Lookpic)"
			},
			signature: {
				default: "",
				help: "Signature to use at the end of the edit",
				default: ""
			},
			sourceMedia: {
				full: "source-media",
				help: "Source media type to show in the title (e.g. DVDRip, HDTVRip, WEB-DL)",
				default: ""
			},
			maxCastMembers: {
				full: "max-cast",
				help: "Maximum number of cast members to show in the output (default 10; 0 removes cast section).",
				default: 10
			},
		})
		.parse();

// Setup an object to store options and meta that have been parsed and checked
var opts = {
		formats: {}
	},
    meta = {};

if(parsedOpts.sourceMedia){
	opts.sourceMedia = parsedOpts.sourceMedia;
}

if(parsedOpts.signature){
	opts.signature = parsedOpts.signature;
}else{
	opts.signature = "";
}

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
	outStream = fs.createWriteStream(opts.output, {mode: 0644});
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
var rl = readline.createInterface(process.stdin, process.stderr, null);

// If close is called, clean up interfaces and exit with code 0.
function close(){
	// These two lines together allow the program to terminate. Without
	// them, it would run forever.
	rl.close();
	process.stdin.destroy();
	outStream.end();
}

// If a TVDB ID was provided, use it!
if(parsedOpts.id && parsedOpts.id.indexOf("tt") != 0){
	opts.id = parsedOpts.id;
	opts.type = TV;
	searchTVDB();
}else if(parsedOpts.seriesID){
	// Series IDs are the next-best thing. Use them, then guess the episode number.
	opts.type = TV;
	opts.seriesID = parsedOpts.seriesID;
	getEpisode();
}else if(parsedOpts.type){
	// No TVDB ID, but at least we have a media type. Moving on!
	if(parsedOpts.type.toLowerCase() == "movie"){
		opts.type = MOVIE;
	}else if(parsedOpts.type.toLowerCase() == "tv"){
		opts.type = TV;
	}else{
		errorDie("Specify a valid media type, or leave it out!");
	}
	// If we have an IMDB ID, use it now.
	if(parsedOpts.id && parsedOpts.id.indexOf("tt") == 0){
		if(opts.type == TV){
			searchTVDB();
		}else{
			searchTMDB();
		}
	}else{
		// Otherwise, guess/ask for the name.
		getName();
	}
}else{
	// If the type isn't specified, guess with a regex; if that fails, ask the user.
	if(parsedOpts.noGuess){
		if(parsedOpts.noInput){
			errorDie("Can't guess the media type, and input isn't allowed!");
		}else{
			var ask = function(){
				rl.question("What type of media is the file? [TV or Movie]", function(type){
					if(["tv", "movie"].indexOf(type.toLowerCase()) == -1){
						console.error("Please answer either TV or Movie!");
						ask();
					}else{
						if(type.toLowerCase() == "tv"){
							opts.type = TV;
						}else{
							opts.type = MOVIE;
						}
						if(parsedOpts.id && parsedOpts.id.indexOf("tt") == 0){
							if(opts.type == TV){
								searchTVDB();
							}else{
								searchTMDB();
							}
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
			getYear();
		}
	}else{
		// Name wasn't provided; Guess or ask.
		var ask = function(){
			rl.question("What is the name of the TV show or movie? ", function(name){
				if(name.length == 0){
					console.error("Please enter a name!");
					ask();
				}else{
					opts.name = name;
					if(opts.type == "TV"){
						getEpisode();
					}else{
						getYear();
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
					getYear();
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

// Guess the release year (don't ask, as it's not that helpful)
function getYear(){
	if(!parsedOpts.noGuess){
		var match = basename.match(MovieTitleRegex);
		var year = match[1];
		if(year){
			opts.year = year;
		}
	}
	searchTMDB();
}

// Guess or ask for the episode and season numbers
function getEpisode(){
	var ask = function(){
		rl.question("What episode is the file? Formats are: S01E01 and 1x01 for season/episode; EP001 and 001 for absolute numbering. 101 will NOT match S01E01.", function(episode){
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
			errorDie("Can't guess episode and input isn't allowed!");
		}else{
			ask();
		}
	}else{
		parseEpisode(basename);
	}
}

// Load a movie object from TMDB
function loadMovie(id){
	var parseResponse = function(error, data){
		if(error){
			throw error;
		}else{
			parseMovie(data[0]);
			if(waitCalled){
				formatOutput();
			}
		}
	}
	TMDBRequest("Movie.getInfo", id, parseResponse);
}

function parseMovie(movie){
	meta.title = movie.name;
	meta.db_url = "http://imdb.com/title/" + movie.imdb_id;
	meta.plot = movie.overview;
	meta.score = movie.rating;
	meta.rating = movie.certification;
	meta.runtime = movie.runtime;
	meta.genres = movie.genres;
	meta.year = movie.released.split("-")[0];
	meta.tagline = movie.tagline;
	meta.budget = movie.budget;
	meta.revenue = movie.revenue;
	meta.people = movie.cast;
	meta.studios = movie.studios;
	meta.trailer = movie.trailer;
	meta.homepage = movie.homepage;
	for(var i = 0; i < movie.posters.length; i++){
		if(movie.posters[i].image.type == "poster" && movie.posters[i].image.size == "mid"){
			meta.poster = movie.posters[i].image.url;
			break;
		}
	}
}

// Ask the user which of a list of movies the file contains.
function askWhichMovie(movies){
	var str = "Search returned multiple movies:\n";
	for(var i = 0; i < movies.length; i++){
		str += "[" + i + "] " + movies[i].name + " (" + movies[i].released + "): " + movies[i].overview + "\n";
	}
	str += "Which one of the above movies is the file? [0]: ";
	function ask(){
		rl.question(str, function(str){
			var num = parseInt(str, 10);
			if(movies[num]){
				loadMovie(movies[num].id);
			}else{
				loadMovie(movies[0].id);
			}
		});
	}
	ask();
}

function searchTVDB(){
	// Load MediaInfo and take screenshots while other stuff happens
	loadMediaInfo();
}

// Search TMDB for a movie
function searchTMDB(){
	// Load MediaInfo and take screenshots while other stuff happens
	loadMediaInfo();
	var parseResponse = function(error, data){
		if(error){
			throw error;
		}else{
			if(data.length == 0){
				errorDie("No movies returned by TMDB!");
			}else if(data.length == 1){
				loadMovie(data[0].id);
			}else{
				// If there are multiple movie matches, either guess or ask.
				if(parsedOpts.noInput){
					if(parsedOpts.noGuess){
						// If no guessing, die
						errorDie("No guessing allowed, and no input allowed!");
					}else{
						loadMovie(data[0].id);
					}
				}else{
					askWhichMovie(data);
				}
			}
		}
	}
	if(opts.id){
		TMDBRequest("Movie.imdbLookup", opts.id, parseResponse);
	}else{
		var name = opts.name.replace(/( |_)/g, "+");
		if(opts.year){
			name += "+" + opts.year;
		}
		TMDBRequest("Movie.search", name, parseResponse);
	}
}

// Load the MediaInfo on a file
function loadMediaInfo(){
	var mediaInfoPath = "ffmpeg";
	if(isWin){
		mediaInfoPath = __dirname + "/deps/win32/mediainfo.exe";
	}
	if(isMac){
		mediaInfoPath = __dirname + "/deps/darwin/mediainfo";
	}
	child_process.exec('"' + mediaInfoPath + '" --Output=XML "' + parsedOpts.path + '"', function(err, data){
		if(err){
			throw(err);
		}else{
			parser.parseString(data, function(err, out){
				if(err){
					throw(err);
				}else{
					meta.mediaInfo = out.File;
					takeScreenshots();
				}
			});
		}
	});
}

function durationToSeconds(str){
	var hms = str.match(/(?:([0-9]+)h )?([0-9+])mn(?: ([0-9]+)s)/);
	var seconds = 0;
	if(hms[1]){
		seconds += parseInt(hms[1], 10)*60*60;
	}
	if(hms[2]){
		seconds += parseInt(hms[2], 10)*60;
	}
	if(hms[3]){
		seconds += parseInt(hms[3], 10);
	}
	return seconds;
}

function takeScreenshots(){
	if(parsedOpts.snapshotCount > 0){
		console.error("Taking snapshots...");
		takeAndUploadScreenshots(opts.path, durationToSeconds(meta.mediaInfo.track[0].Duration), false, parsedOpts.snapshotCount, function(URLs, times){
			console.error("Finished taking screenshots.");
			meta.screenshots = [];
			for(var i = 0; i < URLs.length; i++){
				meta.screenshots.push({
					URL: URLs[i],
					time: times[i]
				});
			}
			waitThenFormatOutput();
		}, function(number, total, url, time){
			console.error("Uploaded screenshot " + number + "/" + total + " from timecode " + time + " to " + url);
		});
	}else{
		console.error("Skipping snapshots...");
		waitThenFormatOutput();
	}
}

function guessMoreMeta(){
	if(parsedOpts.noGuess){
		return;
	}
	if(!opts.sourceMedia){
		var match = basename.match(/\b((?:HDTV|HDRip|DTV|TV|PDTV|BluRay|BR|BD|DVD\d?|DVD-?R|R\d|CAM|TS|WEB(?:-?DL)?)(?:-?Rip)?)\b/i);
		if(match){
			opts.sourceMedia = match[0];
		}else{
			opts.sourceMedia = "";
		}
	}
}

var waitCalled = false;

function waitThenFormatOutput(){
	if(meta.title){
		// DB Search Finished
		formatOutput();
	}else{
		waitCalled = true;
	}
}

function getQuality(){
	var vertical, horizontal;
	for(var i = 0; i < meta.mediaInfo.track.length; i++){
		var track = meta.mediaInfo.track[i];
		if(track.type != "Video"){
			continue;
		}
		vertical = parseInt(track.height.match(/^([0-9 ]+) pixels/)[1].replace(" ", ""), 10);
		horizontal = parseInt(track.width.match(/^([0-9 ]+) pixels/)[1].replace(" ", ""), 10);
	}
	if(!horizontal || !vertical){
		return "";
	}
	if(vertical >= 1714 || horizontal >= 3656){
		return "4K";
	}else if(horizontal >= 1998 || vertical >= 1332){
		return "2K";
	}else if(vertical >= 1080 || horizontal >= 1920){
		return "1080p";
	}else if(vertical >= 720 || horizontal >= 1280){
		return "720p";
	}else if(vertical >= 480 || horizontal >= 640){
		return "480p";
	}else{
		return "SD";
	}
}

function getCodecs(){
	var videoCodec, audioCodecs = [];
	for(var i = 0; i < meta.mediaInfo.track.length; i++){
		if(meta.mediaInfo.track[i].type == "Video"){
			videoCodec = meta.mediaInfo.track[i].format;
		}else if(meta.mediaInfo.track[i].type == "Audio"){
			audioCodecs.push(meta.mediaInfo.track[i].format);
		}
	}
	return videoCodec + (audioCodecs.length > 0 ? ((videoCodec ? (videoCodec + "/") : "") + audioCodecs.join("/")) : "");
}

function formatTitle(){
	var format;
	if(opts.titleFormat){
		format = opts.titleFormat;
	}else{
		format = "%TITLE% (%YEAR%) - %QUALITY% - %SOURCEMEDIA% - %CODECS% - %SOURCE% - %USER%";
	}
	var title = format
		.replace("%TITLE%", meta.title)
		.replace("%YEAR%", meta.year)
		.replace("%QUALITY%", getQuality())
		.replace("%SOURCEMEDIA%", opts.sourceMedia)
		.replace("%CODECS%", getCodecs())
		.replace("%SOURCE%", parsedOpts.source)
		.replace("%USER%", parsedOpts.user)
		.replace(/  +/g, " ")
		.replace(/-(?: -)+/g, "-")
		.replace(/ ?\(\)/g, " ")
		.replace(/ ?-? $/,"");
	return title;
}

function formatMediaInfo(){
	return "[icon=details2]\n"+
	"TODO: Write MediaInfo Formatter\n";
}

function formatCast(){
	if(!meta.people || parsedOpts.maxCastMembers == 0){
		return "";
	}
	var str = "[icon=cast2]\n";
	var imageString = "[center]";
	var imageCount = 0;
	var imageMax = 3;
	var count = 0;
	var max = parsedOpts.maxCastMembers;
	var peopleStr = "";
	for(var i = 0; i < meta.people.length; i++){
		if(meta.people[i].job == "Actor"){
			peopleStr += "[url=" + meta.people[i].url + "]" + meta.people[i].name + "[/url]: " + meta.people[i].character + "\n";
			count++;
			if(meta.people[i].profile && imageCount < imageMax){
				imageString +=  "[url=" + meta.people[i].url + "][img]" + meta.people[i].profile + "[/img][/url]";
				imageMax++;
			}
		}
		if(count >= max){
			break;
		}
	}
	if(imageCount > 0){
		return str + peopleStr;
	}else{
		return str + imageString + "[/center]\n" + peopleStr;
	}
}

function formatScreens(){
	if(!meta.screenshots){
		return "";
	}
	var str = "[icon=screens2]";
	for(var i = 0; i < meta.screenshots.length; i++){
		str +=  "\nScreenshot " + (i+1) + ", at " + meta.screenshots[i].time + "\n" + 
				"[img]" + meta.screenshots[i].URL + "[/img]";
	}
	return str;
}

function formatNote(){
	var format = "";
	if(opts.formats.infoFormat){
		format = opts.formats.infoFormat;
	}else{
		format = "[icon=note2]\n" + 
				 "Thanks to the original encoder/uploader, %SOURCE%! :bow:";
	}
	if(opts.source){
		return format.replace("%SOURCE%", opts.source);
	}else{
		return "";
	}
}

function formatInfo(){
	var format = "";
	if(opts.formats.infoFormat){
		format = opts.formats.infoFormat;
	}else{
		format = "[icon=info2]\n TODO: WRITE INFO FORMATTER\n";
	}
	return format;
}

function formatPlot(){
	return "[icon=plot2]\n" + meta.plot;
}

function writeOutput(data){
	outStream.write(data);
}

function formatOutput(){
	guessMoreMeta();
	var str = "";
	var outFormat;
	if(opts.formats.output){
		outFormat = opts.formats.output;
	}else{
		outFormat = "[center][img]%POSTER_URL%[/img][/center]\n" + 
					"[center][title=%TITLE_COLOR%]%FORMATTED_TITLE%[/title][/center]\n" + 
					"[b]\n" + 
					"%INFO%" + 
					"%PLOT%\n" + 
					"%MEDIAINFO%\n" +
					"%CAST%\n" +
					"%SCREENS%\n" +
					"%NOTE%\n" +
					"[/b]\n" + 
					"%SIGNATURE%";
	}
	var output = outFormat
					.replace("%FORMATTED_TITLE%", formatTitle())
					.replace("%TITLE_COLOR%", (opts.type == "TV") ? "red" : "purple")
					.replace("%POSTER_URL%", meta.poster)
					.replace("%DB%", (opts.type == "TV") ? "TVDB" : "IMDB")
					.replace("%DB_URL%", meta.db_url)
					.replace("%PLOT%", formatPlot())
					.replace("%INFO%", formatInfo())
					.replace("%MEDIAINFO%", formatMediaInfo())
					.replace("%CAST%", formatCast())
					.replace("%SCREENS%", formatScreens())
					.replace("%NOTE%", formatNote())
					.replace("%SIGNATURE%", opts.signature);
	writeOutput(output);
	close();
}

// Upload some data to Lookpic.
/*
	data: data to upload
	type: MIME type of data
	resize: Lookpic resize type, or -1 to not resize
	callback: Callback function; takes a posted image URL as an argument
*/
function uploadLookpic(data, type, resize, callback){
	var multipart = [
			{body: new Buffer(data, "binary"), "Content-Disposition": 'form-data; name="image"; filename="image.png"', "Content-Type": type},
			{body: "5000000", "Content-Disposition": 'form-data; name="MAX_FILE_SIZE"'},
			{body: Math.max(resize, 0).toString(10), "Content-Disposition": 'form-data; name="resize"'},
			{body: "Upload", "Content-Disposition": 'form-data; name="submit"'}
		];
	if(resize > -1){
		multipart.push({body: "1", "Content-Disposition": 'form-data; name="stat_resize"'});
	}
	request.post({
		url: "http://lookpic.com/upload.php",
		multipart: multipart,
		headers: {
			"content-type": "multipart/form-data",
			"Origin": "http://lookpic.com",
			"Referer": "http://lookpic.com/",
			"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
			"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_7_3) AppleWebKit/536.10+ (KHTML, like Gecko) Version/5.1.5 Safari/534.55.3"
		}
	}, function(err, res, body){
		if(err){
			throw(err);
		}else{
			callback(body.match(/\[IMG\](.*)\[\/IMG\]/i)[1].replace("/t2/", "/i2/"));
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
	var ffmpegPath = "ffmpeg";
	if(isWin){
		ffmpegPath = __dirname + "/deps/win32/ffmpeg.exe";
	}
	if(isMac){
		ffmpegPath = __dirname + "/deps/darwin/ffmpeg";
	}
	return child_process.exec('"' + ffmpegPath + '" -i "' + path + '" -ss ' + time + ' -vframes 1 -y' + size + ' -sameq -vcodec png -f image2 -', {
		maxBuffer: 1000000000*1024,
		encoding: "binary"
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
	var timecodes = [];
	for(var i = 0; i < count; i++){
		var timecode = secondsToHHMMSS(getRandomInt(start, end));
		timecodes.push(timecode);
		takeAndUploadScreenshot(path, timecode, false, function(URL){
			screenshotURLs.push(URL);
			if(progressCallback){
				progressCallback(screenshotURLs.length, count, URL, timecodes[screenshotURLs.length - 1]);
			}
			if(screenshotURLs.length == count){
				callback(screenshotURLs, timecodes);
			}
		});
		start = end;
		end += increment;
	}
}