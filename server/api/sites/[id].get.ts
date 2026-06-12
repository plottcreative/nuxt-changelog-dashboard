export default cachedEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  return await getPostFromDB(id)
}, {
  maxAge: 60,
  swr: true,
  staleMaxAge: 300,
})
