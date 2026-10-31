import { describe, expect, test } from 'bun:test'
import { categoryGroups, groupVariants, joinCategory, joinVariant, nextSkus, skuPrefix, sortCategories, splitCategory, splitVariant, topCategory } from './catalog'

const cat = (id: string, name: string) => ({ id, name })

describe('categorías', () => {
 test('ruta y partes', () => {
  expect(joinCategory('Bebidas', ' Gaseosas ')).toBe('Bebidas › Gaseosas')
  expect(splitCategory('Bebidas › Gaseosas')).toEqual({ parent: 'Bebidas', leaf: 'Gaseosas' })
  expect(splitCategory('Snacks')).toEqual({ parent: null, leaf: 'Snacks' })
  expect(topCategory('Bebidas › Gaseosas')).toBe('Bebidas')
  expect(topCategory('Snacks')).toBe('Snacks')
 })
 test('orden: principal y luego sus hijas', () => {
  const s = sortCategories([cat('1', 'Snacks'), cat('2', 'Bebidas › Aguas'), cat('3', 'Bebidas'), cat('4', 'Bebidas › Gaseosas')])
  expect(s.map((c) => c.name)).toEqual(['Bebidas', 'Bebidas › Aguas', 'Bebidas › Gaseosas', 'Snacks'])
 })
 test('grupos del select', () => {
  const g = categoryGroups([cat('1', 'Snacks'), cat('2', 'Bebidas'), cat('3', 'Bebidas › Aguas')])
  expect(g).toEqual([
   { label: 'Bebidas', items: [{ id: '2', label: 'Bebidas (general)' }, { id: '3', label: 'Aguas' }] },
   { label: 'Snacks', items: [{ id: '1', label: 'Snacks' }] },
  ])
 })
})

describe('variantes', () => {
 test('nombre base y variante', () => {
  expect(joinVariant('Helado con toppings', 'Yogurt griego')).toBe('Helado con toppings · Yogurt griego')
  expect(splitVariant('Helado con toppings · Yogurt griego')).toEqual({ base: 'Helado con toppings', variant: 'Yogurt griego' })
  expect(splitVariant('Chocolate')).toEqual({ base: 'Chocolate', variant: null })
 })
 test('agrupa solo con 2 o más variantes de la misma categoría', () => {
  const p = (id: string, name: string, c = 'c1') => ({ id, name, category: { id: c } })
  const r = groupVariants([p('1', 'Helado · Fresa'), p('2', 'Canchita'), p('3', 'Helado · Vainilla'), p('4', 'Gaseosa · Inca'), p('5', 'Helado · Fresa', 'c2')])
  expect(r.map((x) => (x.type === 'group' ? `G:${x.base}:${x.variants.map((v) => v.id)}` : `S:${x.product.id}`))).toEqual(['G:Helado:1,3', 'S:2', 'S:4', 'S:5'])
 })
})

describe('SKU automático', () => {
 test('prefijo de 3 letras sin tildes ni símbolos', () => {
  expect(skuPrefix('Bebidas › Gaseosas')).toBe('GAS')
  expect(skuPrefix('Helados y postres')).toBe('HEL')
  expect(skuPrefix('Ñandú')).toBe('NAN')
  expect(skuPrefix('A')).toBe('AXX')
  expect(skuPrefix('¡!')).toBe('PRO')
 })
 test('siguiente correlativo y varios seguidos', () => {
  expect(nextSkus('HEL', [])).toEqual(['HEL-0001'])
  expect(nextSkus('HEL', ['HEL-0007', 'hel-0003', 'GAS-0099', 'HEL-ABC'], 3)).toEqual(['HEL-0008', 'HEL-0009', 'HEL-0010'])
 })
})
