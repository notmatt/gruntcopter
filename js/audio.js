// get audio from the browser (Chrome 24/Canary)

var socket

function connectSocket(cb) {
  var ip = "ve.5bpbxlsy.vesrv.com:5000"
  if (typeof socket !== "undefined") socket.disconnect()
  var options = {secure: false, reconnect: false, 'force new connection': true}
  socket = io.connect(ip, options)
  socket.on('connected', cb)
}

function disconnectSocket() {
  if (typeof socket !== "undefined") socket.disconnect()
}

