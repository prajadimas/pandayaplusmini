const app = require('express')()
const http = require('http').createServer(app)
const io = require('socket.io')(http)
const bodyParser = require('body-parser')
const createError = require('http-errors')
const helmet = require('helmet')
const path = require('path')
const ip = require('ip')
// const SerialPort = require('serialport')
const Wifi = require('rpi-wifi-connection')
const { exec } = require('child_process')
const gpio = require('onoff').Gpio
const Bluetooth = require('bluetooth-serial-port')
require('dotenv').config()

// initiate class instance
const btSerial = new Bluetooth.BluetoothSerialPort()
const wifi = new Wifi()

// set data store locator
const store = require('data-store')({
	path: path.resolve(__dirname, 'config', 'app.json')
})

const port = process.env.PORT || 50105
const offButton = new gpio(21,'in', 'both')

var socketClient = []

// console.log('IP is: ', ip.address())
setTimeout(function () {
	if (ip.address().toString() === '127.0.0.1') {
		console.log('Not Connected to Network')
		// searching for bluetooth device
		btSerial.inquire()
		btSerial
		.on('failure', function (err) {
			// fail to search bluetooth device
			console.error(err)
			// try to search bluetooth device again
			setTimeout(function () {
				btSerial.inquire()
			}, 5000)		
		})
		.on('found', function (address, name) {
			// found bluetooth device
			console.log('Address, Name: ', address, name)
			btSerial.findSerialPortChannel(address, function (channel) {
				console.log('Name, Channel: ', name, channel)
				btSerial.connect(address, channel, function () {
					console.log('Connected')
					btSerial.on('data', (buffer) => {
						// console.log('Message: ', JSON.parse(buffer.toString()))	
						var wifiStr = buffer.toString()
						var wifi = JSON.parse(wifiStr)
						if (wifi['ssid'] && wifi['psk'] && wifi['appsAddress']) {
							store.set('connect', wifi['appsAddress'])
							store.load()
							// connecting to wifi ...
							wifiConnect({
								ssid: wifi['ssid'],
								psk: wifi['psk']
							})
							.then((res) => {
								// connect to wifi success
								console.log(res + ' connect to network')
								var ackConnected = function () {
									btSerial.write(Buffer.from('Connected to WIFI, IP=' + ip.address().toString(), 'utf-8'), function (err, bytesWritten) {
										if (err) {
											console.error(err)
											return ackConnected()
										} else {
											// close connection
											btSerial.close()
										}
									})
								}
								ackConnected()
							})
							.catch((err) => {
								// connect to wifi failed
								console.error(err)
								var ackFailedConnect = function () {
									btSerial.write(Buffer.from('Failed to Connect to WIFI', 'utf-8'), function (error, bytesWritten) {
										if (err) {
											console.error(err)
											return ackFailedConnect()
										}
									})
								}
								ackFailedConnect()
							})
						}
					})
				}, function () {
					// if none is found, try to search bluetooth device again
					setTimeout(function () {
						btSerial.inquire()
					}, 5000)		
				})
			})
		})
		.on('finished', function () {
			console.log('Finished')
			// btSerial.close()
		})
	}
}, 20000)

/* SerialPort.list()
.then(list => {
	console.log(list)
})
.catch(err => {
	console.error(err)
})

// var serialPort = new SerialPort('/dev/ttyAMA0', {
var serialPort = new SerialPort('/dev/ttyS0', {
	baudRate: 9600,
	databits: 8,
	parity: 'none',
	stopBits: 1,
	flowControl: false
}, function (err) {
	if (err) {
		console.error(err)
	} else {
		serialPort.on('data', function (data) {
			// console.log('Data: ', data.toString('utf-8'))
			console.log('Data: ', data)
		})
	}
}) */

// wifi connection function
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

// create shutdown function, must run in sudo state
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
	})
}

// watch power button event
offButton.watch(function (err, value) {
	console.log('shutdown initiated')
	if (value == 1) {
		// poweroff device
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

// not found
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

// socket io connection
io.on('connection', (socket) => {
	socket.on('client', (data) => {
		console.log('Client Connected: ', data)
		socketClient.push({
			client: data,
			_id: socket.id
		})
		console.log('Client Connected: ', socketClient)
	})
	socket.on('data', (data) => {
		data['device'] = socketClient.find(({ _id }) => _id === socket.id).client
		// console.log('Data: ', data)
		for (var i = 0; i < socketClient.length; i++) {
			if (socketClient[i].client.includes('antares')) {
				io.to(socketClient[i]._id).emit('data', data)
			}
		}
	})
	socket.on('disconnect', () => {
		console.log('Client Disconnected: ', socket.id)
		for (var i = 0; i < socketClient.length; i++) {
			if (socketClient[i]._id === socket.id) {
				socketClient.splice(i, 1)
				break
			}
		}
		console.log('Client Connected: ', socketClient)
	})
})

// start web server
http.listen(port, '0.0.0.0', () => {
	console.log('service is listening on ' + ip.address().toString() + ' port ' + port.toString())
})


