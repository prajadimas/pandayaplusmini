const app = require('express')()
const http = require('http').createServer(app)
const io = require('socket.io')(http)
const bodyParser = require('body-parser')
const createError = require('http-errors')
const helmet = require('helmet')
const path = require('path')
const ip = require('ip')
const SerialPort = require('serialport')
const Wifi = require('rpi-wifi-connection')
const { exec } = require('child_process')
const gpio = require('onoff').Gpio
require('dotenv').config()

const wifi = new Wifi()
const store = require('data-store')({
	path: path.resolve(__dirname, 'config', 'app.json')
})
const port = process.env.PORT || 50105
const offButton = new gpio(21,'in', 'both')

var socketClient = []

/* SerialPort.list()
.then(list => {
	console.log(list)
})
.catch(err => {
	console.error(err)
}) */

/* var serialPort = new SerialPort('/dev/ttyS0', {
	baudRate: 19200
}, function (err) {
	if (err) {
		console.error(err)
	} else {
		serialPort.on('data', function (data) {
			console.log('Data: ', data.toString('utf-8'))
		})
	}
}) */

// Wifi connection function
function wifiConnect(opts) {
	var opts = opts || {}
	return new Promise((resolve, reject) => {
		wifi.connect({ ssid: opts.ssid, psk: opts.psk })
		.then(() => {
			resolve('success')
		})
		.catch((err) => {
			console.error(err)
			reject(err)
		})
	})	
}

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

/* wifiConnect({
	ssid: 'SSID Input',
	psk: 'SSID Pass'
})
.then((res) => {
	console.log(res + ' connect to network')
})
.catch((err) => {
	console.error(err)
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

io.on('connection', (socket) => {
	socket.on('client', (data) => {
		console.log('Client Connected: ', data)
		socketClient.push({
			client: data,
			_id: socket.id
		})
		socket.emit('config', { address: 0x45 })
		console.log('Client: ', socketClient)
	})
	socket.on('data', (data) => {
		data['device'] = socketClient.find(({ _id }) => _id === socket.id).client
		console.log('Data: ', data)
	})
	socket.on('disconnect', () => {
		console.log('Client Disconnected: ', socket.id)
		for (var i = 0; i < socketClient.length; i++) {
			if (socketClient[i]._id === socket.id) {
				socketClient.splice(i, 1)
				break
			}
		}
		console.log('Client: ', socketClient)
	})
})

http.listen(port, '0.0.0.0', () => {
	console.log('service is listening on ' + ip.address().toString() + ' port ' + port.toString())
})


