export interface GpsCoords {
  lat: number
  lng: number
  accuracy?: number
}

export function getCurrentPosition(): Promise<GpsCoords> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocalização não suportada neste dispositivo'))
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        })
      },
      (err) => {
        reject(new Error(`Erro ao obter localização: ${err.message}`))
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  })
}
