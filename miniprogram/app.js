App({
  globalData: { cloudReady: false },
  onLaunch() {
    if (wx.cloud) {
      wx.cloud.init({ env: require('./config').envId, traceUser: true })
      this.globalData.cloudReady = true
    }
  }
})
