/* =====================================================================
   The map. Coloured dots and nothing else — details live in the sheet.
   ===================================================================== */

const MapView = (() => {

  let map = null;
  let layer = null;
  const markers = {};          // colony id -> marker
  let selectedId = null;
  let pickMode = null;         // callback while placing a new colony
  let pickMarker = null;

  function init() {
    const cfg = window.CONFIG.MAP;

    map = L.map('map', {
      center: cfg.center,
      zoom: cfg.zoom,
      minZoom: cfg.minZoom,
      maxZoom: cfg.maxZoom,
      zoomControl: false,
      maxBounds: L.latLngBounds(cfg.bounds),
      maxBoundsViscosity: 0.7,
      tap: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);
    L.control.scale({ imperial: true, metric: false, position: 'bottomright' }).addTo(map);

    layer = L.layerGroup().addTo(map);

    map.on('click', e => {
      if (pickMode) {
        placePickMarker(e.latlng.lat, e.latlng.lng);
        pickMode(e.latlng.lat, e.latlng.lng);
      } else {
        clearSelection();
      }
    });

    return map;
  }

  function icon(colony, selected) {
    const cls = 'pin pin-' + UI.statusColor(colony.status) +
      (selected ? ' pin-sel' : '') +
      (isClaimed(colony) ? ' pin-claim' : '');
    return L.divIcon({
      className: '',
      html: '<div class="' + cls + '"></div>',
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    });
  }

  function isClaimed(c) {
    if (!c.claimed_by || !c.claimed_until) return false;
    return UI.parseDate(c.claimed_until) >= new Date(new Date().toDateString());
  }

  /* ------------------------------------------------------------ render */

  function render(list, onPinClick) {
    layer.clearLayers();
    Object.keys(markers).forEach(k => delete markers[k]);

    list.forEach(c => {
      if (c.latitude === null || c.longitude === null) return;
      const m = L.marker([c.latitude, c.longitude], {
        icon: icon(c, c.id === selectedId),
        keyboard: true,
        title: c.location_text || c.name || c.colony_code,
        riseOnHover: true
      });
      m.on('click', ev => {
        L.DomEvent.stopPropagation(ev);
        select(c.id);
        onPinClick(c.id);
      });
      m.addTo(layer);
      markers[c.id] = { marker: m, colony: c };
    });
  }

  function select(id) {
    if (selectedId && markers[selectedId]) {
      markers[selectedId].marker.setIcon(icon(markers[selectedId].colony, false));
    }
    selectedId = id;
    if (id && markers[id]) {
      markers[id].marker.setIcon(icon(markers[id].colony, true));
    }
  }

  function clearSelection() {
    select(null);
    if (UI.sheetIsOpen()) UI.closeSheet(true);
  }

  function focus(colony, zoom) {
    if (colony.latitude === null || colony.longitude === null) return;
    map.setView([colony.latitude, colony.longitude], zoom || Math.max(map.getZoom(), 15), {
      animate: true
    });
  }

  function fitAll(list) {
    const pts = list.filter(c => c.latitude !== null).map(c => [c.latitude, c.longitude]);
    if (!pts.length) return;
    map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 14 });
  }

  /* -------------------------------------------------- placing a new pin */

  function startPick(cb) {
    pickMode = cb;
    document.getElementById('map').style.cursor = 'crosshair';
  }

  function stopPick() {
    pickMode = null;
    document.getElementById('map').style.cursor = '';
    if (pickMarker) { map.removeLayer(pickMarker); pickMarker = null; }
  }

  function placePickMarker(lat, lng) {
    if (pickMarker) map.removeLayer(pickMarker);
    pickMarker = L.marker([lat, lng], {
      draggable: true,
      icon: L.divIcon({
        className: '',
        html: '<div class="pin pin-red pin-sel"></div>',
        iconSize: [18, 18], iconAnchor: [9, 9]
      })
    }).addTo(map);
    pickMarker.on('dragend', () => {
      const p = pickMarker.getLatLng();
      if (pickMode) pickMode(p.lat, p.lng);
    });
    map.panTo([lat, lng]);
  }

  function locate() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('This device cannot share its location.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        err => reject(new Error(
          err.code === 1 ? 'Location permission was declined. You can still tap the map.'
                         : 'Could not get a location fix. Tap the map instead.')),
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
      );
    });
  }

  const instance = () => map;

  return { init, render, select, clearSelection, focus, fitAll,
           startPick, stopPick, placePickMarker, locate, instance, isClaimed };
})();
