const app = require('express')()
const http = require('http').createServer(app)
const io = require('socket.io')(http)
const bodyParser = require('body-parser')
const createError = require('http-errors')
const helmet = require('helmet')
const path = require('path')
const SerialPort = require('serialport')
const ip = require('ip')
const { exec } = require('child_process')
const gpio = require('onoff').Gpio
require('dotenv').config()

const store = require('data-store')({
	path: path.resolve(__dirname, 'config', 'app.json')
})
const port = process.env.PORT || 50105
const offButton = new gpio(19,'in', 'both')

SerialPort.list()
.then(list => {
	console.log(list)
})
.catch(err => {
	console.error(err)
})

// Create shutdown function
function shutdown(callback) {
	exec('shutdown -P now', function (error, stdout, stderr) { 
		if (err) {
			callback(err)
		} else {
			if (stdout) {
				callback(null, stdout)
				return process.exit()
			} else {
				callback(stderr)
			}
		}
	});
}

/* shutdown(function (err, output) {
	if (err) {
		console.error(err)
	} else {
		console.log(output)
	}
}) */

offButton.watch(function (err, value) {
	console.log('shutdown initiated')
	if (value == 1) {
		// Poweroff
		shutdown(function (err, output) {
			if (err) {
				console.error(err)
			} else {
				console.log(output)
			}
		})
	}
})

app.use(bodyParser.urlencoded({ limit: '1mb', extended: true }))
app.use(bodyParser.json({ limit: '1mb', extended: true }))
app.use(helmet())

app.get('/', (req, res, next) => {
	try {
		res.status(200).json({
			message: 'server is up'
		})
	} catch (err) {
		next(createError(500))
	}
})

app.get('/ping', (req, res, next) => {
	try {
		res.status(200).send('pong')
	} catch (err) {
		next(createError(500))
	}
})

app.post('/config', (req, res, next) => {
	try {
		console.log('Config', req.body.config)
		store.set('config', req.body.config)
		store.load()
		res.status(200).json({
			message: 'OK'
		})
	} catch (err) {
		next(createError(500))
	}
})

app.use((req, res, next) => {
	next(createError(404))
})

// error handler
app.use((err, req, res, next) => {
	console.error(err)
	res.locals.message = err.message
	res.locals.error = process.env.NODE_ENV === 'development' ? err : {}
	res.status(err.status || 500).json({
		message: err.message
	})
})

http.listen(port, '0.0.0.0', () => {
	console.log('service is listening on ' + ip.address().toString() + ' port ' + port.toString())
})



