function createTunnelInitializer({
  startTunnelGatewayServer,
  restoreTunnelTargetFromConfig,
}) {
  let initialized = false;

  return () => {
    if (initialized) return false;
    initialized = true;

    startTunnelGatewayServer();
    restoreTunnelTargetFromConfig();
    return true;
  };
}

module.exports = {
  createTunnelInitializer,
};
