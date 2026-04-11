const BASE = 'https://servicodados.ibge.gov.br/api/v1/localidades'

export interface IBGEState {
  id: number
  sigla: string
  nome: string
}

export interface IBGECity {
  id: number
  nome: string
}

// Estados hardcoded para funcionar offline.
// A API do IBGE é usada apenas para municípios (5570 cidades).
export const BRAZIL_STATES: IBGEState[] = [
  { id: 12, sigla: 'AC', nome: 'Acre' },
  { id: 27, sigla: 'AL', nome: 'Alagoas' },
  { id: 16, sigla: 'AP', nome: 'Amapá' },
  { id: 13, sigla: 'AM', nome: 'Amazonas' },
  { id: 29, sigla: 'BA', nome: 'Bahia' },
  { id: 23, sigla: 'CE', nome: 'Ceará' },
  { id: 53, sigla: 'DF', nome: 'Distrito Federal' },
  { id: 32, sigla: 'ES', nome: 'Espírito Santo' },
  { id: 52, sigla: 'GO', nome: 'Goiás' },
  { id: 21, sigla: 'MA', nome: 'Maranhão' },
  { id: 51, sigla: 'MT', nome: 'Mato Grosso' },
  { id: 50, sigla: 'MS', nome: 'Mato Grosso do Sul' },
  { id: 31, sigla: 'MG', nome: 'Minas Gerais' },
  { id: 15, sigla: 'PA', nome: 'Pará' },
  { id: 25, sigla: 'PB', nome: 'Paraíba' },
  { id: 41, sigla: 'PR', nome: 'Paraná' },
  { id: 26, sigla: 'PE', nome: 'Pernambuco' },
  { id: 22, sigla: 'PI', nome: 'Piauí' },
  { id: 33, sigla: 'RJ', nome: 'Rio de Janeiro' },
  { id: 24, sigla: 'RN', nome: 'Rio Grande do Norte' },
  { id: 43, sigla: 'RS', nome: 'Rio Grande do Sul' },
  { id: 11, sigla: 'RO', nome: 'Rondônia' },
  { id: 14, sigla: 'RR', nome: 'Roraima' },
  { id: 42, sigla: 'SC', nome: 'Santa Catarina' },
  { id: 35, sigla: 'SP', nome: 'São Paulo' },
  { id: 28, sigla: 'SE', nome: 'Sergipe' },
  { id: 17, sigla: 'TO', nome: 'Tocantins' },
]

export async function fetchCities(uf: string): Promise<IBGECity[]> {
  const cacheKey = `ibge_cities_${uf}`
  try {
    const cached = sessionStorage.getItem(cacheKey)
    if (cached) return JSON.parse(cached) as IBGECity[]
  } catch {}

  const res = await fetch(`${BASE}/estados/${uf}/municipios?orderBy=nome`)
  if (!res.ok) throw new Error('Erro ao buscar municípios')
  const data: IBGECity[] = await res.json()

  try {
    sessionStorage.setItem(cacheKey, JSON.stringify(data))
  } catch {}

  return data
}
