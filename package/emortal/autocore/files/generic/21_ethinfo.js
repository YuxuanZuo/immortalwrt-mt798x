'use strict';
'require baseclass';
'require rpc';
'require network';

var callSwconfigFeatures = rpc.declare({
  object: 'luci',
  method: 'getSwconfigFeatures',
  params: ['switch'],
  expect: { '': {} }
});

var callSwconfigPortState = rpc.declare({
  object: 'luci',
  method: 'getSwconfigPortState',
  params: ['switch'],
  expect: { result: [] }
});

var callLuciBoardJSON = rpc.declare({
  object: 'luci-rpc',
  method: 'getBoardJSON',
  expect: { '': {} }
});

var callLuciNetworkDevices = rpc.declare({
  object: 'luci-rpc',
  method: 'getNetworkDevices',
  expect: { '': {} }
});

var isDSA = false;

const ethStyle = {
  box: 'max-width: 100px;',
  head: `
    border-radius: 7px 7px 0 0;
    text-align: center;
    font-weight: bold;`,
  body: `
    border: 1px solid lightgrey;
    border-radius: 0 0 7px 7px;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;`,
  icon: 'margin: 5px; width: 40px;',
  speed: 'font-size: 0.8rem; font-weight: bold;',
  traffic: `
    border-top: 1px solid lightgrey;
    font-size: 0.8rem;`
};

function formatSpeed(speed) {
  if (speed <= 0) return '-';
  const speedInt = parseInt(speed);
  if (isNaN(speedInt)) return '-';
  return speedInt < 1000 ? `${speedInt} M` : `${speedInt / 1000} GbE`;
}

function getPortColor(carrier, duplex) {
  if (!carrier) return 'background-color: whitesmoke;';
  if (duplex === 'full' || duplex === true)
    return 'background-color: greenyellow;';
  return 'background-color: darkorange';
}

function getPortIcon(carrier) {
  return L.resource(`icons/port_${carrier ? 'up' : 'down'}.png`);
}

return baseclass.extend({
  title: _('Ethernet Information'),

  load: function () {
    return network.getSwitchTopologies().then(function (topologies) {
      if (Object.keys(topologies).length === 0) {
        isDSA = true;
        return Promise.all([
          L.resolveDefault(callLuciBoardJSON(), {}),
          L.resolveDefault(callLuciNetworkDevices(), {})
        ]);
      }

      callSwconfigPortState('switch0').then((ports) => {
        topologies.switch0.portstate = ports;
      });
      return Promise.all([
        topologies,
        L.resolveDefault(callLuciBoardJSON(), {}),
        L.resolveDefault(callLuciNetworkDevices(), {})
      ]);
    });
  },

  render_gsw: function (data) {
    const topologies = data[0];
    const board = data[1];
    const netdevs = data[2];

    const ethPorts = [];
    const wan = netdevs[board.network.wan.device];
    const { speed, duplex, carrier } = wan.link;
    let portIcon = getPortIcon(carrier);
    let portColor = getPortColor(carrier, duplex);
    ethPorts.push(
      E('div', { style: ethStyle.box }, [
        E('div', { style: ethStyle.head + portColor }, 'WAN'),
        E('div', { style: ethStyle.body }, [
          E('img', { style: ethStyle.icon, src: portIcon }),
          E('div', { style: ethStyle.speed }, formatSpeed(speed)),
          E('div', { style: ethStyle.traffic }, [
            '\u25b2\u202f%1024.1mB'.format(wan.stats.tx_bytes),
            E('br'),
            '\u25bc\u202f%1024.1mB'.format(wan.stats.rx_bytes)
          ])
        ])
      ])
    );

    const switch0 = topologies.switch0;
    for (const port of switch0.ports) {
      const label = port.label.toUpperCase();
      if (!label.startsWith('LAN')) continue;
      const { link, duplex, speed } = switch0.portstate[port.num];

      portIcon = getPortIcon(link);
      portColor = getPortColor(link, duplex);
      const txrx = { tx_bytes: 0, rx_bytes: 0 };
      const stats = netdevs['br-lan'].stats;
      const { tx_bytes, rx_bytes } = link ? stats : txrx;
      ethPorts.push(
        E('div', { style: ethStyle.box }, [
          E('div', { style: ethStyle.head + portColor }, port.label),
          E('div', { style: ethStyle.body }, [
            E('img', { style: ethStyle.icon, src: portIcon }),
            E('div', { style: ethStyle.speed }, formatSpeed(speed)),
            E('div', { style: ethStyle.traffic }, [
              '\u25b2\u202f%1024.1mB'.format(tx_bytes),
              E('br'),
              '\u25bc\u202f%1024.1mB'.format(rx_bytes)
            ])
          ])
        ])
      );
    }

    return ethPorts;
  },

  render_dsa: function (data) {
    const board = data[0];
    const netdevs = data[1];

    const ethPorts = [];
    const wan = board.network.wan.device;
    let devices = `${wan},lan0,lan1,lan2,lan3,lan4,lan5,lan6`;
    devices = devices.split(',');
    for (const device of devices) {
      if (device in netdevs === false) continue;
      const dev = netdevs[device];
      const { speed, duplex, carrier } = dev.link;
      let portIcon = getPortIcon(carrier);
      let portColor = getPortColor(carrier, duplex);
      ethPorts.push(
        E('div', { style: ethStyle.box }, [
          E('div', { style: ethStyle.head + portColor }, dev.name),
          E('div', { style: ethStyle.body }, [
            E('img', { style: ethStyle.icon, src: portIcon }),
            E('div', { style: ethStyle.speed }, formatSpeed(speed)),
            E('div', { style: ethStyle.traffic }, [
              '\u25b2\u202f%1024.1mB'.format(dev.stats.tx_bytes),
              E('br'),
              '\u25bc\u202f%1024.1mB'.format(dev.stats.rx_bytes)
            ])
          ])
        ])
      );
    }

    return ethPorts;
  },

  render: function (data) {
    const ethPorts = isDSA ? this.render_dsa(data) : this.render_gsw(data);
    const gridStyle = `
      display: grid; grid-gap: 5px 5px;
      grid-template-columns: repeat(auto-fit, minmax(70px, 1fr));
      margin-bottom: 1em`;
    return E('div', { style: gridStyle }, ethPorts);
  }
});
