'use strict';
'require baseclass';
'require rpc';
'require uci';
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

function formatSpeed(speed) {
  if (!speed) return '-';
  return speed < 1000 ? `${speed} M` : `${speed / 1000} GbE`;
}

function getPortColor(link, duplex) {
  if (!link) return 'background-color: whitesmoke;';
  const color = duplex == 'full' || duplex ? 'greenyellow' : 'darkorange';
  return 'background-color: ' + color;
}

function getPortIcon(link) {
  return L.resource(`icons/port_${link ? 'up' : 'down'}.png`);
}

return L.Class.extend({
  title: _('Ethernet Information'),

  load: function () {
    return network.getSwitchTopologies().then(function (topologies) {
      let tasks = [];

      for (let switchName in topologies) {
        tasks.push(
          callSwconfigFeatures(switchName).then(
            L.bind(function (features) {
              this.features = features;
            }, topologies[switchName])
          )
        );
        tasks.push(
          callSwconfigPortState(switchName).then(
            L.bind(function (ports) {
              this.portstate = ports;
            }, topologies[switchName])
          )
        );
      }

      return Promise.all([
        topologies,
        L.resolveDefault(callLuciBoardJSON(), {}),
        L.resolveDefault(callLuciNetworkDevices(), {})
      ]);
    });
  },

  render: function (data) {
    const topologies = data[0];
    const board = data[1];
    const netdevs = data[2];

    const boxStyle = 'max-width: 100px;';
    const boxHeadStyle =
      'border-radius: 7px 7px 0 0;' +
      'text-align: center;' +
      'font-weight:bold;';
    const boxbodyStyle =
      'border: 1px solid lightgrey;' +
      'border-radius: 0 0 7px 7px;' +
      'display:flex; flex-direction: column;' +
      'align-items: center; justify-content:center;';
    const iconStyle = 'margin: 5px; width: 40px;';
    const speedStyle = 'font-size:0.8rem; font-weight:bold;';
    const trafficStyle =
      'border-top: 1px solid lightgrey;' + 'font-size:0.8rem;';

    const ethPorts = [];
    const wan = netdevs[board.network.wan.device];
    const { speed, duplex, carrier } = wan.link;
    let portIcon = getPortIcon(carrier);
    let portColor = getPortColor(carrier, duplex);
    ethPorts.push(
      E('div', { style: boxStyle }, [
        E('div', { style: boxHeadStyle + portColor }, 'WAN'),
        E('div', { style: boxbodyStyle }, [
          E('img', { style: iconStyle, src: portIcon }),
          E('div', { style: speedStyle }, formatSpeed(speed)),
          E('div', { style: trafficStyle }, [
            '\u25b2\u202f%1024.1mB'.format(wan.stats.tx_bytes),
            E('br'),
            '\u25bc\u202f%1024.1mB'.format(wan.stats.rx_bytes)
          ])
        ])
      ])
    );

    const switch0 = topologies.switch0;
    for (const port of switch0.ports) {
      if (!port.label.startsWith('LAN')) continue;
      const { link, duplex, speed } = switch0.portstate[port.num];
      portIcon = getPortIcon(link);
      portColor = getPortColor(link, duplex);
      const txrx = { tx_bytes: 0, rx_bytes: 0 };
      const lanStats = netdevs['br-lan'].stats;
      const { tx_bytes, rx_bytes } = link ? lanStats : txrx;
      ethPorts.push(
        E('div', { style: boxStyle }, [
          E('div', { style: boxHeadStyle + portColor }, port.label),
          E('div', { style: boxbodyStyle }, [
            E('img', { style: iconStyle, src: portIcon }),
            E('div', { style: speedStyle }, formatSpeed(speed)),
            E('div', { style: trafficStyle }, [
              '\u25b2\u202f%1024.1mB'.format(tx_bytes),
              E('br'),
              '\u25bc\u202f%1024.1mB'.format(rx_bytes)
            ])
          ])
        ])
      );
    }

    const gridStyle =
      'display:grid; grid-gap: 5px 5px;' +
      'grid-template-columns:repeat(auto-fit, minmax(70px, 1fr));' +
      'margin-bottom:1em';
    return E('div', { style: gridStyle }, ethPorts);
  }
});
