
const Seneca = require('seneca')
const Hapi = require('@hapi/hapi')
const Inert = require('@hapi/inert')

setup()

async function setup() {
  const si = Seneca({legacy:{transport:false}})

  si
    .test('print')
    .use('promisify')
    .use('@seneca/hapi')
    .use('..', {pins:['a:1','c:1']})

    .message('a:1', async function(msg, meta) {
      return {t:'a', x:msg.x, safe:meta.custom.external.safe}
    })
    .message('b:1', async function(msg, meta) {
      return {t:'b', x:msg.x, safe:meta.custom.external.safe}
    })

    .message('c:1', async function(msg) {
      return await this.post({b:1,x:msg.x})
    })

  
  await si.ready()
  
  const hapi = new Hapi.Server({port:8080})

  await hapi.register(Inert)

  hapi.route({
    method: 'GET',
    path: '/{path*}',
    handler: {
      directory: {
        path: __dirname
      }
    }
  })

  hapi.route({
    method: 'GET',
    path: '/seneca-browser.js',
    handler: {
      file: {
        path: __dirname + '/../node_modules/seneca-browser/seneca-browser.js'
      }
    }
  })

  hapi.route({
    method: 'POST',
    path: '/msg',
    config: {
      handler: si.export('hapi/action_handler')
    }
  })

  await hapi.start()

  console.log(hapi.info)
}
