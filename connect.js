require('dotenv').config();
const WebSocketClient = require('websocket').client;
const axios = require('axios');

const accessToken = process.env.ACCESS_TOKEN;
const HA_REST_API = process.env.HA_REST_API;
const HA_WS_API = process.env.HA_WS_API;

const debug = console.log;

const client = new WebSocketClient();

const request = axios.create({
  baseURL: HA_REST_API,
  timeout: 1000,
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    "content-type": "application/json",
  }
});

async function deleteAutomation(id) {
  return request.delete(`config/automation/config/${id}`).then(res => res.data)
}

async function getAutomation(id) {
  return request.get(`config/automation/config/${id}`).then(res => res.data)
}
async function createAutomation(data) {
  const id = (new Date()).getTime()
  return request.post(`config/automation/config/${id}`, data)
    .then((res) => {
      return getAutomation(id)
    })
}

async function createAutomationFromBluepoint(data) {
  const id = (new Date()).getTime()
  return request.post(`config/automation/config/${id}`, data)
    .then((res) => {
      return getAutomation(id)
    })
}

client.on('connectFailed', function (error) {
  debug('Connect Error: ' + error.toString());
});


client.on('connect', function (connection) {
  //////////////////////////
  // helper: send message to server
  //////////////////////////
  const callbackCommandMap = new Map();

  function sendMessageCallback(payload, callback, { skipId = false } = {}) {
    if (connection.connected) {
      const id = callbackCommandMap.size + 1;

      if (!skipId) {
        callbackCommandMap.set(id, callback ? callback : () => { });
        payload.id = id;
      }
      debug(`Send: id = ${skipId ? 'skip' : id}\n` + JSON.stringify(payload, null, 2));
      connection.sendUTF(JSON.stringify(payload));
    }
  }

  function subscribeEvent(payload, fn) {
    const wrappedFn = (payload) => {
      if (payload.type === 'event') {
        fn(payload);
      }
    }
    sendMessageCallback(payload, wrappedFn);
  }

  function sendMessage(payload, options = {}) {
    const timeout = options?.timeout || 10000;
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('timeout'))
      }, timeout);

      sendMessageCallback(payload, (resultPayload) => {
        clearTimeout(timeoutId);
        resolve(resultPayload);
      }, options);
    });
  }

  function sendAuth() {
    sendMessageCallback({
      "type": "auth",
      "access_token": accessToken
    }, null, { skipId: true })
  }

  //////////////////////////
  // main
  //////////////////////////
  debug('WebSocket Client Connected');
  connection.on('error', function (error) {
    debug("Connection Error: " + error.toString());
  });
  connection.on('close', function () {
    debug('Connection Closed');
  });
  connection.on('message', function (message) {
    if (message.type === 'utf8') {
      const payloadUtf8 = message.utf8Data;
      const payload = JSON.parse(payloadUtf8);

      const { type, id, ...others } = payload;
      debug("Received: \n" + JSON.stringify(payload, null, 2).slice(0, 255));

      if (id) {
        const fn = callbackCommandMap.get(id);
        if (fn) (
          process.nextTick((fn, payload) => {
            fn(payload)
          }, fn, payload)
        )
      }

      if (type === 'auth_required') {
        sendAuth()
      }
      if (type === 'auth_ok') {



        (async () => {
          let payload = {}
          let msg = {}

          //===============
          // common
          //===============
          // 取得所有裝置狀態
          // payload = await sendMessage({
          //   "type": "get_states"
          // });
          // console.log(payload);

          // // 更新 entity 組態資訊
          // payload = await sendMessage({
          //   "type": "config/entity_registry/update",
          //   "entity_id": "automation.test3_2",
          //   "name": "test3-fix-node2",
          //   "icon": null,
          //   "area_id": null,
          //   "new_entity_id": "automation.test3_2"
          // });
          // console.log(payload);
          //
          // // 取得 entity 組態資訊
          payload = await sendMessage({
            "type": "config/entity_registry/get",
            "entity_id": "automation.test3_2"
          });
          // console.log(payload);

          // 手動 “觸發執行 automation”
          await sendMessage({
            "type": "call_service",
            "domain": "automation",
            "service": "trigger",
            "service_data": {
              "entity_id": "automation.test3_2",
              "skip_condition": true
            }
          });

          // 手動 “觸發執行 script”
          await sendMessage({
            "type": "call_service",
            "domain": "script",
            "service": "confirmable_notification_1",
            "service_data": {}
          });

          subscribeEvent({
            "type": "subscribe_events",
            "event_type": "state_changed"
          }, (payload) => {
            console.log('=> state_changed', payload);
          })

          //===============
          // blueprints
          //===============
          payload = await sendMessage({
            "type": "blueprint/list",
            "domain": "automation"
          });
          console.log(payload);

          payload = await sendMessage({
            "type": "blueprint/list",
            "domain": "script"
          });
          console.log(payload);

          // create a automation from blueprint
          // id = timestamp ms
          // POST http://localhost:8123/api/config/automation/config/{id}
          // {
          //   "description": "",
          //   "alias": "Zonetest",
          //   "use_blueprint": {
          //     "path": "homeassistant/notify_leaving_zone.yaml",
          //     "input": {
          //       "person_entity": "person.eugene",
          //       "zone_entity": "zone.home",
          //       "notify_device": "051604f2d6b4b4e63a97a889af469b47"
          //     }
          //   }
          // }
          // const newAutomationFromBluepoint = await createAutomationFromBluepoint(
          //   {
          //     "description": "",
          //     "alias": "Zonetest-2",
          //     "use_blueprint": {
          //       "path": "homeassistant/notify_leaving_zone.yaml",
          //       "input": {
          //         "person_entity": "person.eugene",
          //         "zone_entity": "zone.home",
          //         "notify_device": "051604f2d6b4b4e63a97a889af469b47"
          //       }
          //     }
          //   }
          // );
          // console.log(newAutomationFromBluepoint);

          //===============
          // automation
          //===============
          // id = timestamp ms
          //
          // GET http://localhost:8123/api/config/automation/config/{id}
          // detail
          //
          // POST http://localhost:8123/api/config/automation/config/{id}
          // create
          // update: body with id
          //
          // DELETE http://localhost:8123/api/config/automation/config/{id}
          // delete

          // payload = await sendMessage({
          //   "type": "config/entity_registry/list",
          // });
          // debug(payload.result.filter(elt => elt.platform === 'automation'));
          //
          // await deleteAutomation('1706028592063');
          // const newAutomation = await createAutomation({
          //   "description": "",
          //   "mode": "single",
          //   "trigger": [],
          //   "condition": [],
          //   "action": [],
          //   "alias": "test3"
          // })
          // debug(newAutomation)
          //
          // debug('new automation', await getAutomation(newAutomation.id))
        })()
          .then(() => {
            console.log('done');
          })
          .catch(e => {
            debug(e)
          })
        // {"type":"subscribe_events","event_type":"component_loaded","id":4}
      }
    }
  });
});

client.connect(HA_WS_API);
