#! /usr/bin/env node
	
// API keys and URL paths
var	TVDB_API_KEY = "88445D4B8F5F27A3",
	TMDB_API_KEY = "5261508c7eb4c0ea4a7c335c8d8e2074",
	TVDB_API_PATH = "http://www.thetvdb.com/",
	TMDB_API_PATH = "http://api.themoviedb.org/2.1/%method%/%lang%/%type%/%key%/%arg%",
	LANGUAGE = "en";

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
	xml2js = require("xml2js"),
	gunzip = require('zlib').gunzip,
	tmdb = require("./tmdb").init(TMDB_API_KEY);

//console.log(request);
	
var parser = new xml2js.Parser();
	
function setTitle(title){
	if(opts && !opts.noInput){
		if(!isWin){
			process.stdout.write("\033]0;" + title + "\007");
		}
	}
}

process.on("exit", function(){
	if(opts){
		setTitle("");
	}
});
	
// Helper functions for TMDB and TVDB
function TMDBRequest(method, arg, callback, i){
	if(!i){
		i = 0;
	}
	if(i > 3){
		// Retry 3 times, then give up
		errDie("TMDB is offline!");
	}
	var url = TMDB_API_PATH.replace("%method%", method).replace("%lang%", LANGUAGE).replace("%type%", "json").replace("%key%", TMDB_API_KEY).replace("%arg%", arg);
	request({url: url}, function(error, response, body){
		if(error){
			return TMDBRequest(method, arg, callback, i+1);
		}
		try{
			var out = JSON.parse(body);
			callback(null, out);
		}catch(e){
			TMDBRequest(method, arg, callback, i+1);
		}
	});}
function TVDBStaticRequest(path, callback){
	var url = TVDB_API_PATH + "data/" + path;
	request({url: url}, function(error, response, body){
		if(error){
			callback(error, null);
		}else{
			function parse(err, body){
				body = body.toString('utf-8');
				parser.parseString(body, function(err, data){
					callback(err, data);
				});
			}
			var encoding = response.headers['content-encoding'];
			if(encoding && encoding.indexOf('gzip') >= 0) {
				gunzip(body, parse);
			}else{
				parse(null, body);
			}
		}
	});
}
function TVDBDynamicRequest(inf, args, callback){
	args.apikey = TVDB_API_KEY;
	var url = TVDB_API_PATH + "api/" + inf + ".php?" + querystring.stringify(args);
	request({url: url}, function(error, response, body){
		if(error){
			callback(error, null);
		}else{
			var encoding = response.headers['content-encoding'];
			if(encoding && encoding.indexOf('gzip') >= 0) {
					body = uncompress(body);
			}
			body = body.toString('utf-8');
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
	ABSOLUTE = "A",
	DATE = "D";

// Set up some reused regexes.
var TVTitleRegex = /(?:\s|-)(?:(?:S([0-9]{2,})E([0-9]{2,})\b)|(?:([0-9]+)x([0-9]{2,}))|(?:EP([0-9]{2,}))|([0-9]{3})|(?:([0-9]{4})(?: |-|\/)([0-9]{2})(?: |-|\/)([0-9]{2})))\b/i;
var MovieTitleRegex = /(?:\b-\b)|(?:\s(?:(?:(?:\(|\[)?([0-9]{4})(?:\)|\])?)|4K|2K|1080p|720p|480p|360p|SD|MKV|X264|H264|H\.264|XVID|AC3|AAC|MKV|MP4|AVI|BluRay|Blu-Ray|BRRIP|DVDRip|DVD|DVDR|DVD-R|R[1-9]|HDTV|HDRip|HDTVRip|DTVRip|DTV|TS|TSRip|CAM|CAMRip|ReadNFO|iNTERNAL))(?:\b)|\(|\[/i;
var RGRegex = /\b(IMMERSE|DIMENSION|LOL|mSD|ORENJI|DHD|ASAP|AFG|THORA|KILLERS|2HD|LMAO|LEGi0N|RiVER|DiVERSiTY|GECKOS|ROVERS|BARGE|CRiMSON|TASTETV|BiA|TLA|BBnRG|KYR|PTpOWeR|MRFIXIT|FRAGMENT|FILMHD|UNVEiL|BLOWME|RELOADED|initialanime|SONiDO|FiHTV|WAF|QCF|SYA|THC|C4TV|DEADPiXEL|KNiFESHARP|eXceSs|SKmbr|RiPRG|UNVEiL|W4F|DEPRiVED)\b/i;

process.title = "NFOMaker";

// Parse arguments with nomnom
var parsedOpts = nomnom
		.script("makeNFO")
		.colors()
		.options({
			path: {
				position: 0,
				help: "File to generate an NFO for.",
				list: false,
				required: true
			},
			output: {
				position: 1,
				help: 'File to save the NFO to. Default is the name of the input file with the extension replaced with "nfo". Set to "-" to write to stdout.',
				list: false
			},
			noGuess: {
				abbr: "N",
				full: "no-guess",
				flag: true,
				help: "Don't try to guess; ask about everything."
			},
			noInput: {
				abbr: "u",
				full: "no-ui",
				flag: true,
				help: "Don't ask about things; bug out if something can't be guessed."
			},
			type: {
				abbr: "t",
				help: "Type of video (either Movie or TV).",
				choices: ["TV", "Movie"],
				required: false
			},
			name: {
				abbr: "n",
				help: "Name of the movie or TV show to search for."
			},
			year: {
				abbr: "y",
				help: "Original release year of the video."
			},
			source: {
				abbr: "s",
				help: "Source RG of the video (OPTIONAL). If specified, they will be credited."
			},
			user: {
				abbr: "u",
				help: "Username to add to the title (OPTIONAL).",
				default: ""
			},
			id: {
				abbr: "i",
				help: "IMDB movie/series or TheTVDB series ID (including tt if it's an IMDB ID)."
			},
			episodeID: {
				full: "episode-id",
				abbr: "I",
				help: "TheTVDB episode ID."
			},
			episode: {
				abbr: "e",
				help: "Episode to search for. Formats are: S01E01 and 1x01 for season/episode; EP001 and 001 for absolute numbering. 101 will NOT match S01E01."
			},
			snapshotCount: {
				abbr: "c",
				default: 4,
				full: "snapshot-count",
				help: "Number of snapshots to take of the video file (uploaded to Lookpic)."
			},
			signature: {
				default: "",
				help: "Signature to use at the end of the edit."
			},
			sourceMedia: {
				full: "source-media",
				help: "Source media type to show in the title (e.g. DVDRip, HDTVRip, WEB-DL).",
				default: ""
			},
			maxCastMembers: {
				full: "max-cast",
				help: "Maximum number of cast members to show in the output (default 10; 0 removes cast section).",
				default: 10
			},
			dvdSort: {
				full: "dvd-order",
				abbr: "d",
				help: "Use DVD ordering instead of aired ordering for episode numbers on TVDB.",
				flag: true
			},
			noFile: {
				full: "no-file",
				abbr: "x",
				help: "Don't load from a file. Disable screenshots and mediainfo.",
				flag: true
			},
			sceneTitle: {
				full: "scene-title",
				help: "Title to use in the output NFO (defaults to an auto-generated one)."
			},
			addInfo: {
				full: "add-info",
				abbr: "a",
				help: "Add additional info to the final NFO (useful with -x)."
			},
			addShots: {
				full: "shots",
				abbr: "b",
				help: "Add external screenshots (preformatted)."
			},
			addNote: {
				full: "note",
				abbr: "c",
				help: "Add a note (greetz, etc...)"
			}
		})
		.parse();
if(process.argv.indexOf("-") != -1){
	parsedOpts.output = "-";
}
		
var presetOpts = {};
if(fs.existsSync("~/.mknfo_settings")){
	try{
		presetOpts = JSON.parse(fs.readFileSync("~/.mknfo_settings"));
	}catch(e){
		// gulp(e);
	}
}

// Setup an object to store options and meta that have been parsed and checked
var opts = {
		formats: {}
	},
    meta = {},
    mediaInfo;

if(parsedOpts.sourceMedia){
	opts.sourceMedia = parsedOpts.sourceMedia;
}

if(parsedOpts.signature){
	opts.signature = parsedOpts.signature;
}else if(presetOpts.signature){
	opts.signature = presetOpts.signature;
}else{
	opts.signature = "";
}

// The path should always be right; it's required
opts.path = parsedOpts.path;

if(parsedOpts.noFile){
	opts.noMediaInfo = true;
	opts.snapshotCount = 0;
	opts.sceneTitle = path.basename(opts.path, path.extname(opts.path));
}else if(!fs.existsSync(opts.path)){
	// Bug out if the file doesn't exist
	errorDie('The file "' + opts.path + '" doesn\'t exist!');
}else{
	opts.snapshotCount = parsedOpts.snapshotCount;
	opts.sceneTitle = parsedOpts.sceneTitle;
}

// Function to bug out in errors
function errorDie(message){
	console.error(message);
	process.exit(1);
}

// Set the output file to <mediafilename>.nfo if it's not given.
opts.output = parsedOpts.output || path.dirname(opts.path) + "/" + path.basename(opts.path, path.extname(opts.path)) + ".nfo";

// Set noInput
opts.noInput = parsedOpts.noInput;

if(opts.output == "-"){
	// Override noInput if writing to stdout.
	opts.noInput = true;
}

setTitle("NFOMaker");

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
	if(opts.output != "-"){
		outStream.end();
	}
}

if(parsedOpts.episodeID){
	// If a TVDB episode ID was provided, use it!
	opts.type = TV;
	opts.episodeID = parsedOpts.episodeID;
	searchTVDB();
}else if(parsedOpts.id && parsedOpts.id.indexOf("tt") != 0){
	// Series IDs are the next-best thing. Use them, then guess the episode number.
	opts.type = TV;
	opts.id = parsedOpts.id;
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
		opts.id = parsedOpts.id;
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
		if(opts.noInput){
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
	if(type == TV){
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
		if(opts.type == TV){
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
					if(opts.type == TV){
						getEpisode();
					}else{
						getYear();
					}
				}
			});
		}
		if(parsedOpts.noGuess){
			// Guessing isn't allowed...
			if(opts.noInput){
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
				if(opts.type == TV){
					getEpisode();
				}else{
					getYear();
				}
			}else{
				if(opts.noInput){
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
		if(match){
			opts.year = match[1];
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
		if(numbers.length > 3){
			errorDie("WTF is this? Episode number is badly mangled.");
		}else if(numbers.length == 3){
			opts.episode = numbers[0] + "/" + numbers[1] + "/" + numbers[2];
			opts.season = DATE;
			searchTVDB();
		}else if(numbers.length == 2){
			opts.season = parseInt(numbers[0], 10);
			opts.episode = parseInt(numbers[1], 10);
			searchTVDB();
		}else if(numbers.length == 1){
			opts.season = ABSOLUTE;
			opts.episode = parseInt(numbers[0], 10);
			searchTVDB();
		}else{
			if(opts.noInput){
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
		if(opts.noInput){
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
		}else if(!data){
			errorDie(error + " " + data);
		}else{
			parseMovie(data[0]);
			if(global.waitCalled){
				formatOutput();
			}
		}
	}
	TMDBRequest("Movie.getInfo", id, parseResponse);
}

function parseMovie(movie){
	meta.title = movie.name;
	meta.imdb_url = "http://imdb.com/title/" + movie.imdb_id;
	meta.plot = movie.overview;
	meta.score = movie.rating;
	meta.certification = movie.certification;
	meta.runtime = movie.runtime;
	meta.genres = movie.genres;
	meta.year = ((typeof movie.released == "string") ? movie.released.split("-")[0] : "");
	if(!meta.year){
		meta.year = "";
	}
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

function parseTVDBList(list){
	if(!list || typeof list != "string"){
		return "";
	}
	var arr = list.split("|");
	arr = arr.splice(1, arr.length - 2);
	return arr.join(", ");
}

function parseTVDBBanners(banners, season, callback){
	if(typeof banners != "object"){
		callback("");
		return;
	}
	if(banners.BannerPath){
		// Only one banner?
		downloadAndReuploadImage("http://thetvdb.com/banners/" + banners.BannerPath, -1, callback);
		return;
	}
	for(var i = 0; i < banners.length; i++){
		if(banners[i].BannerType2 == "seasonwide" && banners[i].Season == season){
			downloadAndReuploadImage("http://thetvdb.com/banners/" + banners[i].BannerPath, -1, callback);
			return;
		}
	}
	for(var i = 0; i < banners.length; i++){
		if(banners[i].BannerType2 == "graphical"){
			downloadAndReuploadImage("http://thetvdb.com/banners/" + banners[i].BannerPath, -1, callback);
			return;
		}
	}
	callback("");
}

function parseTVDBData(series, actors, banners, episode){
	if(typeof series.Airs_DayOfWeek == "string"){
		meta.airs = series.Airs_DayOfWeek + ((typeof series.Airs_Time == "string") ? (" at " + series.Airs_Time) : "");
	}
	meta.series_first_aired = series.FirstAired;
	if(series.FirstAired && series.FirstAired.split){
		meta.year = series.FirstAired.split("-")[0];
	}
	if(!meta.year){
		meta.year = "";
	}
	meta.episode_first_aired = episode.FirstAired;
	if(typeof episode.IMDB_ID == "string"){
		meta.imdb_url = "http://www.imdb.com/title/" + episode.IMDB_ID + "/";
	}
	meta.tvdb_url = "http://thetvdb.com/?tab=episode&seriesid=" + episode.seriesid + "&seasonid=" + episode.seasonid + "&id=" + episode.id + "&lid=7";
	if(typeof series.IMDB_ID == "string"){
		meta.series_imdb_url = "http://www.imdb.com/title/" + series.IMDB_ID + "/";
	}
	meta.series_tvdb_url = "http://thetvdb.com/?tab=series&id=" + episode.seriesid + "&lid=7";
	meta.network = series.Network;
	meta.series_plot = series.Overview;
	meta.episode_plot = episode.Overview;
	meta.series_score = series.Rating;
	meta.score = episode.Rating;
	meta.certification = series.ContentRating;
	if(episode.EpisodeNumber && typeof episode.EpisodeNumber !== "object" && episode.SeasonNumber !== ""){
		if(episode.SeasonNumber == "0"){
			meta.episode = "Special #" + episode.EpisodeNumber;
			meta.aired_episode = "Special #" + episode.EpisodeNumber;
		}else{
			meta.episode = "S" + pad(episode.SeasonNumber, 2) + "E" + pad(episode.EpisodeNumber, 2);
			meta.aired_episode = "S" + pad(episode.SeasonNumber, 2) + "E" + pad(episode.EpisodeNumber, 2);
		}
	}
	if(episode.DVD_season !== "" && typeof episode.DVD_season !== "object" && episode.DVD_episodenumber){
		if(episode.DVD_season === "0"){
			if(!meta.episode || opts.DVDSort){
				meta.episode = "Special #" + episode.DVD_episodenumber;
			}
			meta.dvd_episode = "Special #" + episode.DVD_episodenumber;
		}else{
			if(!meta.episode || opts.DVDSort){
				meta.episode = "S" + pad(episode.DVD_season, 2) + "E" + pad(episode.DVD_episodenumber, 2);
			}
			meta.dvd_episode = "S" + pad(episode.DVD_season, 2) + "E" + pad(episode.DVD_episodenumber, 2);
		}
	}
	meta.genres = parseTVDBList(series.Genre);
	meta.runtime = series.Runtime;
	meta.title = series.SeriesName;
	meta.status = series.Status;
	meta.guest_stars = parseTVDBList(episode.GuestStars);
	meta.director = parseTVDBList(series.Director);
	meta.writer = parseTVDBList(series.Writer);
	meta.episode_name = episode.EpisodeName;
	meta.people = actors;
	parseTVDBBanners(banners, episode.SeasonNumber, function(poster){
		meta.poster = poster;
		if(global.waitCalled){
			formatOutput();
		}
	});
}

function requestSeries(seriesID){
	TVDBStaticRequest("/series/" + seriesID + "/" + LANGUAGE + ".xml",  function(err, record){
		if(err){
			throw(err);
		}
		var series = record.Series;
		if(opts.season == DATE){
			TVDBDynamicRequest("GetEpisodeByAirDate", {airdate: opts.episode, seriesid: seriesID}, function(err, record){
				if(err){
					throw(err);
				}
				if(record.Error){
					errorDie("No episode found for that airdate!");
				}
				TVDBStaticRequest("/episodes/" + record.Episode.id + "/" + LANGUAGE + ".xml", function(err, record){
					if(err){
						throw(err);
					}
					var episode = record.Episode;
					TVDBStaticRequest("/series/" + seriesID + "/banners.xml", function(err, record){
						if(err){
							throw(err);
						}
						var banners = record.Banner;
						TVDBStaticRequest("/series/" + seriesID + "/actors.xml", function(err, record){
							if(err){
								throw(err);
							}
							var actors = record.Actor;
							parseTVDBData(series, actors, banners, episode);
						});
					});
				});
			});
		}else{
			// DECIDE ABSOLUTE OR NORMAL; DEFAULT OR DVD SORTING
			var url;
			if(opts.season == ABSOLUTE){
				url = "/series/" + seriesID + "/absolute/" + opts.episode + "/" + LANGUAGE + ".xml";
			}else{
				url = "/series/" + seriesID + "/" + (parsedOpts.dvdSort ? "dvd" : "default") + "/" + opts.season + "/" + opts.episode + "/" + LANGUAGE + ".xml";
			}
			TVDBStaticRequest(url, function(err, record){
				if(err){
					throw(err);
				}
				if(record.body && record.body.h1 == "Not Found"){
					errorDie("Episode not listed in TVDB!");
				}
				var episode = record.Episode;
				TVDBStaticRequest("/series/" + seriesID + "/banners.xml", function(err, record){
					if(err){
						throw(err);
					}
					var banners = record.Banner;
					TVDBStaticRequest("/series/" + seriesID + "/actors.xml", function(err, record){
						if(err){
							throw(err);
						}
						var actors = record.Actor;
						parseTVDBData(series, actors, banners, episode);
					});
				});
			});
		}
	});
}

function searchTVDB(){
	// Load MediaInfo and take screenshots while other stuff happens
	loadMediaInfo();
	if(opts.id){
		if(opts.id.indexOf("tt") == 0){
			TVDBDynamicRequest("GetSeriesByRemoteID", {imdbid: opts.id}, function(err, record){
				requestSeries(record.Series.seriesid);
			});
		}else{
			requestSeries(opts.id);
		}
	}else if(opts.episodeID){
		TVDBStaticRequest("/episodes/" + opts.episodeID + "/" + LANGUAGE + ".xml", function(err, record){
			if(err){
				throw(err);
			}
			var episode = record.Episode;
			TVDBStaticRequest("/series/" + episode.seriesid + "/" + LANGUAGE + ".xml", function(err, record){
				if(err){
					throw(err);
				}
				var series = record.Series;
				TVDBStaticRequest("/series/" + episode.seriesid + "/banners.xml", function(err, record){
					if(err){
						throw(err);
					}
					var banners = record.Banner;
					TVDBStaticRequest("/series/" + episode.seriesid + "/actors.xml", function(err, record){
						if(err){
							throw(err);
						}
						var actors = record.Actor;
						parseTVDBData(series, actors, banners, episode);
					});
				});
			});
		});
	}else{
		TVDBDynamicRequest("GetSeries", {seriesname: opts.name, language: LANGUAGE}, function(err, record){
			if(err){
				throw(err);
			}
			if(Array.isArray(record.Series)){
				// If there are multiple TV matches, either guess or ask.
				if(opts.noInput){
					if(parsedOpts.noGuess){
						// If no guessing, die
						errorDie("No guessing allowed, and no input allowed!");
					}else{
						requestSeries(record.Series[0].seriesid);
					}
				}else{
					askWhichShow(record.Series);
				}
			}else if(!record.Series){
				errorDie("No such series!");
			}else{
				requestSeries(record.Series.seriesid);
			}
		});
	}
}

// Ask which of an array of shows is correct.
function askWhichShow(shows){
	shows = shows.splice(0, 5);
	var str = "Search returned multiple shows; listing first " + shows.length + ":\n";
	for(var i = 0; i < shows.length; i++){
		str += "[" + i + "] " + shows[i].SeriesName + (shows[i].FirstAired ? " (" + shows[i].FirstAired + "):" : ":") + " " + shows[i].Overview + "\n";
	}
	str += "Which one of the above shows is correct? [0]: ";
	function ask(){
		rl.question(str, function(str){
			var num = parseInt(str, 10);
			if(shows[num]){
				requestSeries(shows[num].id);
			}else{
				requestSeries(shows[0].id);
			}
		});
	}
	ask();
}

// Search TMDB for a movie
function searchTMDB(){
	// Load MediaInfo and take screenshots while other stuff happens
	loadMediaInfo();
	var parseResponse = function(error, data){
		if(error){
			throw error;
		}else if(!data){
			errorDie(error + " " + data);
		}else{
			if(data.length == 0){
				errorDie("No movies returned by TMDB!");
			}else if(data.length == 1){
				if(!data[0].id){
					errorDie("No movies returned by TMDB!");
				}
				loadMovie(data[0].id);
			}else{
				if(opts.year){
					var newList = [];
					for(var i = 0; i < data.length; i++){
						var movie = data[i];
						if(!(typeof movie.released == "string") || movie.released.split("-")[0] == opts.year){
							newList.push(movie);
						}
					}
					if(newList.length == 1){
						loadMovie(newList[0].id);
					}else if(newList.length > 1){
						data = newList;
					}
				}
				// If there are multiple movie matches, either guess or ask.
				if(opts.noInput){
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
		TMDBRequest("Movie.search", name, parseResponse);
	}
}

// Load the MediaInfo on a file
function loadMediaInfo(){
	if(opts.noMediaInfo){
		takeScreenshots();
		return;
	}
	var mediaInfoPath = "mediainfo";
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
					var tracks = out.File.track;
					for(var i = 0; i < tracks.length; i++){
						tracks[i].type = tracks[i]["@"].type;
					}
					mediaInfo = out.File.track;
					takeScreenshots();
				}
			});
		}
	});
}

function durationToSeconds(str){
	var hms = str.match(/^(?:(\d+)h )?(\d+)mn?(?: (\d+)s)?$/);
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
	if(opts.snapshotCount > 0){
		console.error("Taking snapshots...");
		takeAndUploadScreenshots(opts.path, durationToSeconds(mediaInfo[0].Duration), false, parsedOpts.snapshotCount, function(URLs, times){
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

function waitThenFormatOutput(){
	if(meta.title){
		// DB Search Finished
		formatOutput();
	}else{
		global.waitCalled = true;
	}
}

function getQuality(){
	if(!mediaInfo){
		return "";
	}
	var vertical, horizontal;
	for(var i = 0; i < mediaInfo.length; i++){
		var track = mediaInfo[i];
		if(track.type != "Video"){
			continue;
		}
		vertical = parseInt(track.Height.match(/^([0-9 ]+) pixels/)[1].replace(" ", ""), 10);
		horizontal = parseInt(track.Width.match(/^([0-9 ]+) pixels/)[1].replace(" ", ""), 10);
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
	if(!mediaInfo){
		return "";
	}
	var videoCodec, audioCodecs = [];
	for(var i = 0; i < mediaInfo.length; i++){
		if(mediaInfo[i].type == "Video" && !videoCodec){
			videoCodec = mediaInfo[i].Format;
		}else if(mediaInfo[i].type == "Audio"){
			if(audioCodecs.indexOf(mediaInfo[i].Format) == -1){
				audioCodecs.push(mediaInfo[i].Format);
			}
		}
	}
	return videoCodec + (audioCodecs.length > 0 ? "/" : "") + audioCodecs.join("-");
}

function formatTitle(){
	if(opts.sceneTitle){
		return opts.sceneTitle;
	}
	var format;
	if(opts.titleFormat){
		format = opts.titleFormat;
	}else{
		format = "%TITLE%" + (meta.type == MOVIE ? " (%YEAR%)" : " - %EPISODE% - %EPISODE_NAME%") + " - %QUALITY% - %CODECS% - %SOURCEMEDIA% - %SOURCE% - %USER%";
	}
	var title = format
		.replace("%TITLE%", meta.title)
		.replace(" ("+meta.year+")", "")
		.replace("%YEAR%", meta.year)
		.replace("%EPISODE%", meta.episode)
		.replace("%EPISODE_NAME%", meta.episode_name)
		.replace("%QUALITY%", getQuality())
		.replace("%SOURCEMEDIA%", opts.sourceMedia)
		.replace("%CODECS%", getCodecs())
		.replace("%SOURCE%", parsedOpts.source)
		.replace("%USER%", parsedOpts.user)
		.replace(/  +/g, " ")
		.replace(/ undefined /g, " ")
		.replace(/ null /g, " ")
		.replace(/-(?: -)+/g, "-")
		.replace(/ ?\(\)/g, " ")
		.replace(/ ?-? $/,"");
	return title;
}

function formatMediaInfo(){
	if(!mediaInfo){
		if(parsedOpts.addInfo){
			return "[icon=info3]\n" + parsedOpts.addInfo + "\n";
		}else{
			return "";
		}
	}
	var colors = ["purple", "blue", "green", "orange", "red"];
	var out = "[icon=info3]";
	for(var i = 0; i < mediaInfo.length; i++){
		var track = mediaInfo[i];
		var color = colors[i%5];
		out += "\n[color=" + color + "]" + track.type + "[/color]\n";
		for(var j in track){
			if(track.hasOwnProperty(j) && j.substring(0, 1).toLowerCase() != j.substring(0, 1)){
				if(j == "Complete_name"){
					track[j] = path.basename(track[j]);
				}
				out += j.replace(/_/g, " ") + ": " + track[j] + "\n";
			}
		}
	}
	if(parsedOpts.addInfo){
		return out + "\n" + parsedOpts.addInfo + "\n";
	}else{
		return out + "\n";
	}
}

function formatCast(){
	if(!meta.people || parsedOpts.maxCastMembers == 0){
		return "";
	}
	if(!meta.people.length){
		if(meta.people.Name){
			meta.people = [meta.people];
		}
	}
	var str = "[icon=cast3]\n";
	var imageString = "[center] ";
	var imageCount = 0;
	var imageMax = 3;
	var count = 0;
	var max = parsedOpts.maxCastMembers;
	var peopleStr = "";
	for(var i = 0; i < meta.people.length; i++){
		if(meta.people[i].Name){
			// Later, possibly download and reupload actor images...
			meta.people[i].profile = false; //"http://thetvdb.com/banners/" + meta.people[i].Image;
			meta.people[i].name = meta.people[i].Name;
			meta.people[i].character = meta.people[i].Role;
			meta.people[i].job = "Actor";
		}
		if(typeof meta.people[i].character != "string"){
			meta.people[i].character = "";
		}
		if(meta.people[i].job == "Actor"){
			if(count < max){
				peopleStr += (meta.people[i].url ? "[url=" + meta.people[i].url + "]" : "") + meta.people[i].name + (meta.people[i].url ? "[/url]: " : (meta.people[i].character ? ": " : "")) + meta.people[i].character + "\n";
				count++;
			}
			if(meta.people[i].profile && imageCount < imageMax){
				imageString +=  (meta.people[i].url ? "[url=" + meta.people[i].url + "]" : "") + "[img]" + meta.people[i].profile + "[/img]" + (meta.people[i].url ? "[/url] " : " ");
				imageCount++;
			}
			if(count >= max && imageCount >= imageMax){
				break;
			}
		}
	}
	if(imageCount > 0){
		return str + imageString + "[/center]\n" + peopleStr + "\n";
	}else{
		return str + peopleStr + "\n";
	}
}

function formatScreens(){
	if(parsedOpts.addShots){
		return "[icon=screens3]\n" + parsedOpts.addShots + "\n";
	}
	if(!meta.screenshots){
		return "";
	}
	var str = "[icon=screens3]";
	for(var i = 0; i < meta.screenshots.length; i++){
		str +=  "\nScreenshot " + (i+1) + ", at " + meta.screenshots[i].time + "\n" + 
				"[img]" + meta.screenshots[i].URL + "[/img]";
	}
	return str + "\n";
}

function formatNote(){
	var format = "";
	if(opts.formats.noteFormat){
		format = opts.formats.noteFormat;
	}else{
		format = "[icon=note3]\n" + 
				 "Thanks to the original encoder/uploader, %SOURCE%! :bow:\n";
	}
	if(parsedOpts.source){
		return format.replace("%SOURCE%", parsedOpts.source) + (parsedOpts.addNote ? (parsedOpts.addNote + "\n") : "");
	}else if(parsedOpts.addNote){
		return "[icon=note3]\n" + parsedOpts.addNote + "\n";
	}else{
		return "";
	}
}

function formatList(list){
	if(!list){
		return;
	}
	if(typeof list == "string"){
		return list;
	}
	var str = "";
	for(var i = 0; i < list.length; i++){
		if(typeof list[i] == "string"){
			str += list[i];
		}else{
			if(list[i].url){
				str += "[url=" + list[i].url + "]" + list[i].name + "[/url]";
			}else{
				str += list.name;
			}
		}
		if(i < list.length - 1){
			str += ", ";
		}
	}
	return str;
}

function formatLanguages(){
	if(!mediaInfo){
		return "";
	}
	var audioLanguages = [], textLanguages = [];
	for(var i = 0; i < mediaInfo.length; i++){
		if(mediaInfo[i].type == "Audio"){
			if(typeof mediaInfo[i].Language == "string" && audioLanguages.indexOf(mediaInfo[i].Language) == -1 && mediaInfo[i].Language.match(/\S/)){
				audioLanguages.push(mediaInfo[i].Language);
			}
		}else if(mediaInfo[i].type == "Text"){
			if(typeof mediaInfo[i].Language == "string" && textLanguages.indexOf(mediaInfo[i].Language) == -1 && mediaInfo[i].Language.match(/\S/)){
				textLanguages.push(mediaInfo[i].Language);
			}
		}
	}
	var outStr = "";
	if(audioLanguages.length > 0){
		outStr += "Spoken Languages: [color=blue]" + audioLanguages.join(", ") + "[/color]\n";
	}
	if(textLanguages.length > 0){
		outStr += "Texted Languages: [color=green]" + textLanguages.join(", ") + "[/color]\n";
	}
	return outStr;
}

function formatInfo(){
	var format = "";
	if(opts.formats.infoFormat){
		format = opts.formats.infoFormat;
	}else{
		format = 	"[icon=details3]\n"+
					"Title: %TITLE%\n"+
					"Year: %YEAR%\n"+
					"Aired Episode: %AIRED_EPISODE%\n"+
					"DVD Episode: %DVD_EPISODE%\n"+
					"Episode Title: %EPISODE_TITLE%\n"+
					"Runtime: %RUNTIME% minutes\n"+
					"First Aired: %EPISODE_FIRST_AIRED%\n"+
					"IMDB URL: %IMDB_URL%\n"+
					"TVDB URL: %TVDB_URL%\n"+
					"Score: %SCORE%\n"+
					"Budget: $%BUDGET%\n"+
					"Revenue: $%REVENUE%\n"+
					"Studios: %FORMAT_STUDIOS%\n"+
					"Network: %NETWORK%\n"+
					"Writer(s): %WRITER%\n"+
					"Director(s): %DIRECTOR%\n"+
					"Guest Stars: %GUEST_STARS%\n"+
					"Genres: %FORMAT_GENRES%\n"+
					"Certification: %CERTIFICATION%\n"+
					"Series TVDB URL: %SERIES_TVDB_URL%\n"+
					"Series IMDB URL: %SERIES_IMDB_URL%\n"+
					"Series Score: %SERIES_SCORE%\n"+
					"Series First Aired: %SERIES_FIRST_AIRED%\n"+
					"Series Status: %STATUS%\n"+
					"Series Airtime: %AIRS%\n"+
					"Homepage: %HOMEPAGE%\n"+
					"%FORMAT_LANGUAGES%";
	}
	for(var i in meta){
		format = format.replace("%" + i.toUpperCase() + "%", meta[i]);
	}
	format = format.replace("%FORMAT_STUDIOS%", formatList(meta.studios));
	format = format.replace("%FORMAT_GENRES%", formatList(meta.genres));
	format = format.replace("%FORMAT_LANGUAGES%", formatLanguages());
	var removeRegex = /\n[^\n]+: \$?(?:undefined|null|(?:%[A-Z_]+%)|0|0? minutes|\[object Object\])?\n/gi
	while(format.match(removeRegex)){
		format = format.replace(removeRegex, "\n");
	}
	return format;
}

function formatTrailer(){
	var format = "[icon=trailer3]\n[video=%YOUTUBE_URL%]\n";
	if(meta.trailer){
		return format.replace("%YOUTUBE_URL%", meta.trailer);
	}else{
		return "";
	}
}

function formatPlot(){
	if(opts.type == TV){
		if((typeof meta.series_plot == "string") && (typeof meta.episode_plot == "string")){
			return  "[icon=plot3]\n" +
					"[color=blue]Series plot[/color]: " + meta.series_plot + "\n" +
					"[color=green]Episode plot[/color]: " + meta.episode_plot + "\n";
		}else if((typeof meta.series_plot == "string")){
			return  "[icon=plot3]\n" +
					"[color=blue]Series plot[/color]: " + meta.series_plot + "\n";
		}else if((typeof meta.episode_plot == "string")){
			return  "[icon=plot3]\n" +
					"[color=blue]Episode plot[/color]: " + meta.episode_plot + "\n";
		}else{
			return "";
		}
	}else{
		return "[icon=plot3]\n" + meta.plot + "\n";
	}
}

var outStream;

function createOutStream(){
	// Create the file write stream. If the output path is "-", use stdout. Otherwise, write to the filesystem.
	if(opts.output == "-"){
		outStream = process.stdout;
		// Override noInput if writing to stdout.
		opts.noInput = true;
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
}


function writeOutput(data){
	outStream.write(data);
}

function formatSignature(){
	if(opts.signature){
		return "\n" + opts.signature;
	}else{
		return "";
	}
}

function formatPoster(){
	if(meta.poster){
		return "[center][img]" + meta.poster + "[/img][/center]\n";
	}else{
		return "";
	}
}

function formatOutput(){
	guessMoreMeta();
	var str = "";
	var outFormat;
	if(opts.formats.output){
		outFormat = opts.formats.output;
	}else{
		outFormat =  "%POSTER%"+ 
					"[center][title=%TITLE_COLOR%]%FORMATTED_TITLE%[/title][/center]\n" + 
					"[b]\n" + 
					"%INFO%" + 
					"%MEDIAINFO%" + 
					"%PLOT%" + 
					"%CAST%" + 
					"%SCREENS%" + 
					"%TRAILER%" + 
					"%NOTE%" + 
					"[/b]" + 
					"%SIGNATURE%";
	}
	var output = outFormat
					.replace("%FORMATTED_TITLE%", formatTitle())
					.replace("%TITLE_COLOR%", (opts.type == TV) ? "red" : "purple")
					.replace("%POSTER%", formatPoster())
					.replace("%PLOT%", formatPlot())
					.replace("%INFO%", formatInfo())
					.replace("%MEDIAINFO%", formatMediaInfo())
					.replace("%CAST%", formatCast())
					.replace("%TRAILER%", formatTrailer())
					.replace("%SCREENS%", formatScreens())
					.replace("%NOTE%", formatNote())
					.replace("%SIGNATURE%", formatSignature);
	createOutStream();
	writeOutput(output);
	close();
}

function downloadAndReuploadImage(url, resize, callback){
	request({url: url, encoding: "binary"}, function(err, res, body){
		if(err){
			throw(err);
		}else{
			uploadLookpic(body, res.headers["content-type"], resize, callback);
		}
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
	var multipart = [
		{body: data, "Content-Disposition": 'form-data; name="image"; filename="image.' + mime.extension(type) + '"', "Content-Type": type},
		{body: "5000000", "Content-Disposition": 'form-data; name="MAX_FILE_SIZE"'},
		{body: Math.max(resize, 0).toString(10), "Content-Disposition": 'form-data; name="resize"'},
		{body: "Upload", "Content-Disposition": 'form-data; name="submit"'}
	];
	if(resize > -1){
		multipart.push({body: "1", "Content-Disposition": 'form-data; name="stat_resize"'});
	}
        //console.log(multipart);
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
			var match = body.match(/\[IMG\](.*)\[\/IMG\]/i);
			if(match){
				callback(match[1].replace("/t2/", "/i2/"));
			}else{
				console.error(body);
				throw new Error();
			}
/*
			try{
				callback(body.match(/\[IMG\](.*)\[\/IMG\]/i)[1].replace("/t2/", "/i2/"));
			}catch(err){
				throw(err);
			}
*/
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
	return child_process.exec('"' + ffmpegPath + '" -ss ' + time + ' -i "' + path + '" -vframes 1 -compression_level 9 -y' + size + ' -filter:v format=rgb24 -vcodec png -f image2 -', {
		maxBuffer: 100000000000*1024,
		timeout: 0
	}, function(error, data, stderr) {
		if(error){
			throw(error);
		}else if(callback) {
			callback(new Buffer(data));
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
	var str;
	if(typeof number == "number"){
		str = number.toString(10);
	}else{
		str = number;
	}
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
	var i = 0;
	function take(){
		var timecode = secondsToHHMMSS(getRandomInt(start, end));
		timecodes.push(timecode);
		takeAndUploadScreenshot(path, timecode, false, function(URL){
			screenshotURLs.push(URL);
			if(progressCallback){
				progressCallback(screenshotURLs.length, count, URL, timecodes[screenshotURLs.length - 1]);
			}
			if(screenshotURLs.length == count){
				callback(screenshotURLs, timecodes);
			}else{
				take();
			}
		});
		start = end;
		end += increment;
	}
	take();
}
