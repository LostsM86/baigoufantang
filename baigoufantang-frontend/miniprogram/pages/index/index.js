const DEFAULT_MEAL_SLOTS = [
  { value: "breakfast", label: "早餐", shortLabel: "早", order: 1 },
  { value: "lunch", label: "午餐", shortLabel: "午", order: 2 },
  { value: "dinner", label: "晚餐", shortLabel: "晚", order: 3 },
  { value: "night_snack", label: "夜宵", shortLabel: "宵", order: 4 },
];

const ORDER_STATUS_TEXT = {
  pending: "待处理",
  approved: "已受理",
  rejected: "已驳回",
  cancelled: "已撤销",
};

const WORK_ORDER_STATUS_TEXT = {
  pending: "待处理",
  processed: "已处理",
  rejected: "已驳回",
  cancelled: "已撤销",
};
const ORDER_RECORD_TABS = [
  { key: "recent", label: "最近10条" },
  { key: "all", label: "全部记录" },
];
const ADMIN_PANEL_TABS = [
  { key: "notice", label: "通知" },
  { key: "category", label: "分类" },
  { key: "menu", label: "菜品" },
  { key: "workorders", label: "工单" },
];

const DEFAULT_DATE_OPTIONS = buildNextSevenDays();
const DEFAULT_SELECTED_DATE = DEFAULT_DATE_OPTIONS.length
  ? DEFAULT_DATE_OPTIONS[0].date
  : "";
const DEFAULT_AVATAR = "/images/avatar.png";
const DEFAULT_GOODS_IMAGE = "/images/default-goods-image.png";

function clone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function chooseImage() {
  return new Promise((resolve, reject) => {
    wx.chooseImage({
      count: 1,
      sizeType: ["compressed"],
      sourceType: ["album", "camera"],
      success: resolve,
      fail: reject,
    });
  });
}

function pad(num) {
  return num < 10 ? `0${num}` : `${num}`;
}

function buildSlotKey(date, mealSlot) {
  return `${date}#${mealSlot}`;
}

function getMealSlotMap(mealSlots) {
  const map = {};
  (mealSlots || DEFAULT_MEAL_SLOTS).forEach((slot) => {
    map[slot.value] = slot;
  });
  return map;
}

function buildNextSevenDays() {
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const list = [];
  const now = new Date();

  for (let i = 0; i < 7; i += 1) {
    const current = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    list.push({
      date: `${current.getFullYear()}-${pad(current.getMonth() + 1)}-${pad(
        current.getDate()
      )}`,
      title: i === 0 ? "今天" : i === 1 ? "明天" : `${pad(
        current.getMonth() + 1
      )}/${pad(current.getDate())}`,
      weekday: weekdays[current.getDay()],
    });
  }

  return list;
}

function formatDateTime(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatMoney(value) {
  return Number(value || 0).toFixed(2);
}

function normalizeMealSlots(rawMealSlots) {
  if (Array.isArray(rawMealSlots)) {
    return rawMealSlots;
  }
  if (typeof rawMealSlots === "string" && rawMealSlots) {
    try {
      const parsed = JSON.parse(rawMealSlots);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch (error) {
      return rawMealSlots
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  return [];
}

function normalizeCategories(rawCategories, mealSlots) {
  const mealSlotMap = getMealSlotMap(mealSlots);
  return (rawCategories || [])
    .slice()
    .sort((left, right) => {
      if ((left.sort || 0) !== (right.sort || 0)) {
        return (left.sort || 0) - (right.sort || 0);
      }
      return (left.id || 0) - (right.id || 0);
    })
    .map((category) => {
      const items = (category.items || category.menuItems || [])
        .slice()
        .sort((left, right) => {
          if ((left.sort || 0) !== (right.sort || 0)) {
            return (left.sort || 0) - (right.sort || 0);
          }
          return (left.id || 0) - (right.id || 0);
        })
        .map((item) => {
          const mealSlotsValue = normalizeMealSlots(item.mealSlots);
          return {
            id: item.id,
            categoryId: item.categoryId || category.id,
            name: item.name || "",
            description: item.description || "现做现出，支持预约",
            imageUrl: item.imageUrl || "",
            displayImageUrl: item.imageUrl || DEFAULT_GOODS_IMAGE,
            price: Number(item.price || 0),
            priceText: formatMoney(item.price || 0),
            enabled: item.enabled !== false,
            sort: item.sort || 10,
            mealSlots: mealSlotsValue,
            mealSlotText: mealSlotsValue
              .map((slotKey) =>
                mealSlotMap[slotKey] ? mealSlotMap[slotKey].label : slotKey
              )
              .join(" / "),
          };
        });

      return {
        id: category.id,
        name: category.name || "",
        sort: category.sort || 10,
        enabled: category.enabled !== false,
        items,
      };
    });
}

function findMenuItem(categories, itemId) {
  for (let i = 0; i < categories.length; i += 1) {
    const category = categories[i];
    for (let j = 0; j < category.items.length; j += 1) {
      const item = category.items[j];
      if (Number(item.id) === Number(itemId)) {
        return item;
      }
    }
  }
  return null;
}

function findCategory(categories, categoryId) {
  for (let i = 0; i < categories.length; i += 1) {
    const category = categories[i];
    if (Number(category.id) === Number(categoryId)) {
      return category;
    }
  }
  return null;
}

function findCategoryIndex(categories, categoryId) {
  for (let i = 0; i < categories.length; i += 1) {
    if (Number(categories[i].id) === Number(categoryId)) {
      return i;
    }
  }
  return -1;
}

function buildDateTabs(dateOptions, selectedDate, slotSelections, myOrders) {
  const cartCountMap = {};
  const orderCountMap = {};

  Object.keys(slotSelections || {}).forEach((slotKey) => {
    const slotSelection = slotSelections[slotKey];
    const items = slotSelection.items || {};
    const count = Object.keys(items).reduce(
      (sum, itemId) => sum + Number(items[itemId] || 0),
      0
    );
    if (count) {
      cartCountMap[slotSelection.mealDate] =
        (cartCountMap[slotSelection.mealDate] || 0) + count;
    }
  });

  (myOrders || []).forEach((order) => {
    if (order.status !== "cancelled") {
      orderCountMap[order.mealDate] = (orderCountMap[order.mealDate] || 0) + 1;
    }
  });

  return (dateOptions || []).map((item) => ({
    date: item.date,
    title: item.title,
    weekday: item.weekday,
    selected: item.date === selectedDate,
    cartCount: cartCountMap[item.date] || 0,
    orderCount: orderCountMap[item.date] || 0,
  }));
}

function buildMealTabs(mealSlots, selectedMealSlot, selectedDate, slotSelections) {
  return (mealSlots || []).map((slot) => {
    const slotSelection = (slotSelections || {})[
      buildSlotKey(selectedDate, slot.value)
    ];
    const count = slotSelection
      ? Object.keys(slotSelection.items || {}).reduce(
          (sum, itemId) => sum + Number(slotSelection.items[itemId] || 0),
          0
        )
      : 0;

    return {
      value: slot.value,
      label: slot.label,
      shortLabel: slot.shortLabel || slot.label,
      selected: slot.value === selectedMealSlot,
      cartCount: count,
    };
  });
}

function buildVisibleCategories(menuCategories, selectedMealSlot, slotSelection) {
  const itemsMap = (slotSelection && slotSelection.items) || {};

  return (menuCategories || [])
    .map((category) => {
      const items = category.items
        .filter(
          (item) =>
            item.enabled && item.mealSlots.indexOf(selectedMealSlot) > -1
        )
        .map((item) => ({
          id: item.id,
          categoryId: item.categoryId,
          name: item.name,
          description: item.description,
          imageUrl: item.imageUrl,
          displayImageUrl: item.displayImageUrl || DEFAULT_GOODS_IMAGE,
          price: item.price,
          priceText: item.priceText,
          mealSlots: item.mealSlots,
          mealSlotText: item.mealSlotText,
          quantity: Number(itemsMap[item.id] || 0),
        }));

      const selectedCount = items.reduce(
        (sum, item) => sum + Number(item.quantity || 0),
        0
      );

      return {
        id: category.id,
        name: category.name,
        items,
        selectedCount,
      };
    })
    .filter((category) => category.items.length > 0);
}

function buildCartGroups(slotSelections, menuCategories, mealSlots) {
  const mealSlotMap = getMealSlotMap(mealSlots);
  const groups = [];
  let cartTotalCount = 0;
  let cartTotalAmount = 0;

  Object.keys(slotSelections || {})
    .sort((left, right) => {
      const [leftDate, leftMeal] = left.split("#");
      const [rightDate, rightMeal] = right.split("#");
      if (leftDate !== rightDate) {
        return leftDate.localeCompare(rightDate);
      }
      return (
        (mealSlotMap[leftMeal] ? mealSlotMap[leftMeal].order : 99) -
        (mealSlotMap[rightMeal] ? mealSlotMap[rightMeal].order : 99)
      );
    })
    .forEach((slotKey) => {
      const slotSelection = slotSelections[slotKey];
      const items = [];
      let groupCount = 0;
      let groupAmount = 0;

      Object.keys(slotSelection.items || {}).forEach((itemId) => {
        const quantity = Number(slotSelection.items[itemId] || 0);
        if (!quantity) {
          return;
        }
        const menuItem = findMenuItem(menuCategories, itemId);
        if (!menuItem) {
          return;
        }
        groupCount += quantity;
        groupAmount += quantity * Number(menuItem.price || 0);
        items.push({
          id: menuItem.id,
          name: menuItem.name,
          quantity,
          priceText: formatMoney(menuItem.price),
          amountText: formatMoney(quantity * Number(menuItem.price || 0)),
        });
      });

      if (!items.length) {
        return;
      }

      cartTotalCount += groupCount;
      cartTotalAmount += groupAmount;
      groups.push({
        slotKey,
        mealDate: slotSelection.mealDate,
        mealSlot: slotSelection.mealSlot,
        mealSlotLabel: mealSlotMap[slotSelection.mealSlot]
          ? mealSlotMap[slotSelection.mealSlot].label
          : slotSelection.mealSlot,
        totalCount: groupCount,
        totalAmountText: formatMoney(groupAmount),
        items,
      });
    });

  return {
    groups,
    cartSlotCount: groups.length,
    cartTotalCount,
    cartTotalAmountText: formatMoney(cartTotalAmount),
  };
}

function buildOrderCards(orderList, mealSlotMap) {
  return (orderList || []).map((order) => {
    const slot = mealSlotMap[order.mealSlot] || {};
    const items = (order.items || []).map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      priceText: formatMoney(item.price),
      amountText: formatMoney(Number(item.price || 0) * Number(item.quantity || 0)),
    }));
    const totalCount = items.reduce(
      (sum, item) => sum + Number(item.quantity || 0),
      0
    );

    return {
      id: order.id,
      orderNo: order.orderNo,
      mealDate: order.mealDate,
      mealSlot: order.mealSlot,
      mealSlotLabel: slot.label || order.mealSlot,
      status: order.status,
      statusText: ORDER_STATUS_TEXT[order.status] || order.status,
      createdAtText: formatDateTime(order.createdAt),
      remark: order.remark || "",
      rejectReason: order.rejectReason || "",
      totalCount,
      canCancel: order.status === "pending" || order.status === "approved",
      items,
    };
  });
}

function buildOrderRecordTabs(currentKey, totalCount) {
  return ORDER_RECORD_TABS.map((item) => ({
    key: item.key,
    label:
      item.key === "recent"
        ? `${item.label}`
        : `${item.label}${totalCount ? ` (${totalCount})` : ""}`,
    active: item.key === currentKey,
  }));
}

function buildWorkOrderCards(workOrders, mealSlotMap) {
  return (workOrders || []).map((workOrder) => {
    const order = workOrder.order || {};
    const slot = mealSlotMap[order.mealSlot] || {};

    return {
      id: workOrder.id,
      orderId: workOrder.orderId,
      title: workOrder.title,
      detail: workOrder.detail || "",
      status: workOrder.status,
      statusText: WORK_ORDER_STATUS_TEXT[workOrder.status] || workOrder.status,
      createdAtText: formatDateTime(workOrder.createdAt),
      orderNo: order.orderNo || "",
      userName: order.userName || "微信用户",
      mealDate: order.mealDate || "",
      mealSlotLabel: slot.label || order.mealSlot || "",
      remark: order.remark || "",
      rejectReason: order.rejectReason || "",
      items: (order.items || []).map((item) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        priceText: formatMoney(item.price),
      })),
      canReview: workOrder.status === "pending" && order.status === "pending",
    };
  });
}

function buildMenuCategoryState(menuCategories, currentIndex) {
  const options = (menuCategories || []).map((item) => ({
    id: item.id,
    name: item.name,
  }));
  const safeIndex =
    options.length && currentIndex < options.length ? currentIndex : 0;
  return {
    options,
    selectedName: options.length ? options[safeIndex].name : "请先新增分类",
    selectedIndex: options.length ? safeIndex : 0,
  };
}

function buildAdminMealSlotChoices(mealSlots, selectedValues) {
  const selectedMap = {};
  (selectedValues || []).forEach((value) => {
    selectedMap[value] = true;
  });
  return (mealSlots || []).map((slot) => ({
    value: slot.value,
    label: slot.label,
    checked: !!selectedMap[slot.value],
  }));
}

Page({
  data: {
    loading: true,
    syncing: false,
    loginBusy: false,
    activeTab: "booking",
    loggedIn: false,
    loginError: "",
    viewerAvatarPreviewUrl: DEFAULT_AVATAR,
    profileDisplayName: "",
    profileAvatarUrl: "",
    profileAvatarPreviewUrl: DEFAULT_AVATAR,
    isAdmin: false,
    viewerLabel: "微信用户",
    adminNotificationEnabled: false,
    adminSubscribeTemplateId: "",
    orderNotificationEnabled: false,
    orderSubscribeTemplateId: "",
    mealSlots: DEFAULT_MEAL_SLOTS,
    dateOptions: DEFAULT_DATE_OPTIONS,
    dateTabs: buildDateTabs(
      DEFAULT_DATE_OPTIONS,
      DEFAULT_SELECTED_DATE,
      {},
      []
    ),
    mealTabs: buildMealTabs(
      DEFAULT_MEAL_SLOTS,
      DEFAULT_MEAL_SLOTS[0].value,
      DEFAULT_SELECTED_DATE,
      {}
    ),
    selectedDate: DEFAULT_SELECTED_DATE,
    selectedMealSlot: "breakfast",
    activeSlotLabel: "",
    lastUpdatedText: "",
    menuCategories: [],
    visibleCategories: [],
    activeCategoryId: 0,
    currentCategoryItems: [],
    currentSlotSelectedCount: 0,
    slotSelections: {},
    cartGroups: [],
    cartSlotCount: 0,
    cartTotalCount: 0,
    cartTotalAmountText: "0.00",
    orderRemark: "",
    orderRecordTab: "recent",
    orderRecordTabs: buildOrderRecordTabs("recent", 0),
    displayedOrders: [],
    canSubmit: false,
    myOrders: [],
    workOrders: [],
    adminLoaded: false,
    adminPanel: "notice",
    adminPanelTabs: ADMIN_PANEL_TABS,
    categoryEditingId: 0,
    categoryName: "",
    categorySort: "10",
    categoryEnabled: true,
    menuEditingId: 0,
    menuName: "",
    menuDescription: "",
    menuImageUrl: "",
    menuImagePreviewUrl: DEFAULT_GOODS_IMAGE,
    menuPrice: "",
    menuSort: "10",
    menuCategoryIndex: 0,
    menuMealSlots: [],
    menuEnabled: true,
    menuCategoryOptions: [],
    selectedMenuCategoryName: "请先新增分类",
    adminMealSlotChoices: buildAdminMealSlotChoices(DEFAULT_MEAL_SLOTS, []),
  },

  showPageLoading(title) {
    if (this.loadingVisible) {
      return;
    }
    this.loadingVisible = true;
    wx.showLoading({
      title,
    });
  },

  hidePageLoading() {
    if (!this.loadingVisible) {
      return;
    }
    this.loadingVisible = false;
    wx.hideLoading();
  },

  async onLoad() {
    this.app = getApp();
    try {
      await this.tryLogin(false);
      await this.reloadPage();
    } catch (error) {
      console.warn("initial login failed", error);
      await this.reloadPage();
    } finally {
      this.setData({
        loading: false,
      });
    }
  },

  async tryLogin(force) {
    this.setData({
      loginBusy: true,
    });

    try {
      const response = await this.app.ensureIdentity({
        force: !!force,
      });
      this.setData({
        loggedIn: this.app.hasIdentity(),
        loginError: "",
        viewerLabel:
          (response.viewer && response.viewer.displayName) || this.data.viewerLabel,
      });
      return response;
    } catch (error) {
      this.setData({
        loggedIn: this.app.hasIdentity(),
        loginError: error && error.message ? error.message : "微信登录失败",
      });
      throw error;
    } finally {
      this.setData({
        loginBusy: false,
      });
    }
  },

  onPullDownRefresh() {
    this.reloadPage(true);
  },

  async reloadPage(stopRefresh) {
    try {
      await this.reloadBookingData();
      if (this.data.activeTab === "admin" && this.data.isAdmin) {
        await this.reloadAdminData();
      }
    } catch (error) {
      this.showError(error);
    } finally {
      if (stopRefresh) {
        wx.stopPullDownRefresh();
      }
    }
  },

  async reloadBookingData() {
    this.setData({ syncing: true });
    try {
      const response = await this.app.request({
        path: "/api/bootstrap",
        requireIdentity: false,
      });

      const mealSlots =
        response.mealSlots && response.mealSlots.length
          ? response.mealSlots
          : DEFAULT_MEAL_SLOTS;
      const dateOptions =
        response.dateOptions && response.dateOptions.length
          ? response.dateOptions
          : buildNextSevenDays();
      const menuCategories = normalizeCategories(response.categories, mealSlots);
      const assetState = await this.resolveAssetState(
        menuCategories,
        response.viewer && response.viewer.avatarUrl
      );
      const mealSlotMap = getMealSlotMap(mealSlots);
      const myOrders = buildOrderCards(response.myOrders, mealSlotMap);
      const categoryState = buildMenuCategoryState(
        assetState.menuCategories,
        this.data.menuCategoryIndex
      );

      let selectedDate = this.data.selectedDate;
      if (!selectedDate || !dateOptions.some((item) => item.date === selectedDate)) {
        selectedDate = dateOptions.length ? dateOptions[0].date : "";
      }

      let selectedMealSlot = this.data.selectedMealSlot;
      if (
        !selectedMealSlot ||
        !mealSlots.some((item) => item.value === selectedMealSlot)
      ) {
        selectedMealSlot = mealSlots.length ? mealSlots[0].value : "";
      }

      this.setData({
        loggedIn: this.app.hasIdentity(),
        loginError: this.app.hasIdentity() ? "" : this.data.loginError,
        isAdmin: !!(response.viewer && response.viewer.isAdmin),
        viewerLabel:
          (response.viewer && response.viewer.displayName) || "微信用户",
        viewerAvatarPreviewUrl: assetState.avatarPreviewUrl || DEFAULT_AVATAR,
        profileDisplayName:
          (response.viewer && response.viewer.displayName) || "",
        profileAvatarUrl:
          (response.viewer && response.viewer.avatarUrl) || "",
        profileAvatarPreviewUrl: assetState.avatarPreviewUrl || DEFAULT_AVATAR,
        adminNotificationEnabled: !!(
          response.adminNotification && response.adminNotification.enabled
        ),
        adminSubscribeTemplateId:
          (response.adminNotification &&
            response.adminNotification.subscribeTemplateId) ||
          "",
        orderNotificationEnabled: !!(
          response.orderNotification && response.orderNotification.enabled
        ),
        orderSubscribeTemplateId:
          (response.orderNotification &&
            response.orderNotification.subscribeTemplateId) ||
          "",
        mealSlots,
        dateOptions,
        selectedDate,
        selectedMealSlot,
        menuCategories: assetState.menuCategories,
        myOrders,
        orderRecordTabs: buildOrderRecordTabs(
          this.data.orderRecordTab,
          myOrders.length
        ),
        menuCategoryOptions: categoryState.options,
        menuCategoryIndex: categoryState.selectedIndex,
        selectedMenuCategoryName: categoryState.selectedName,
        adminMealSlotChoices: buildAdminMealSlotChoices(
          mealSlots,
          this.data.menuMealSlots
        ),
        lastUpdatedText: formatDateTime(new Date()),
      });

      if (!this.data.isAdmin && this.data.activeTab === "admin") {
        this.setData({
          activeTab: "booking",
        });
      }

      this.refreshBookingView();
    } finally {
      this.setData({ syncing: false });
    }
  },

  async reloadAdminData() {
    const response = await this.app.request({
      path: "/api/admin/bootstrap",
      admin: true,
    });
    const normalizedCategories = normalizeCategories(
      response.categories,
      this.data.mealSlots
    );
    const assetState = await this.resolveAssetState(normalizedCategories);
    const mealSlotMap = getMealSlotMap(this.data.mealSlots);
    const categoryState = buildMenuCategoryState(
      assetState.menuCategories,
      this.data.menuCategoryIndex
    );

    this.setData({
      adminLoaded: true,
      adminNotificationEnabled: !!(
        response.adminNotification && response.adminNotification.enabled
      ),
      adminSubscribeTemplateId:
        (response.adminNotification &&
          response.adminNotification.subscribeTemplateId) ||
        "",
      menuCategories: assetState.menuCategories,
      menuCategoryOptions: categoryState.options,
      menuCategoryIndex: categoryState.selectedIndex,
      selectedMenuCategoryName: categoryState.selectedName,
      adminMealSlotChoices: buildAdminMealSlotChoices(
        this.data.mealSlots,
        this.data.menuMealSlots
      ),
      workOrders: buildWorkOrderCards(response.workOrders, mealSlotMap),
    });
    this.refreshBookingView();
  },

  refreshBookingView() {
    const selectedDate = this.data.selectedDate;
    const selectedMealSlot = this.data.selectedMealSlot;
    const activeSlotKey = buildSlotKey(selectedDate, selectedMealSlot);
    const currentSelection =
      this.data.slotSelections[activeSlotKey] || {
        mealDate: selectedDate,
        mealSlot: selectedMealSlot,
        items: {},
      };

    const visibleCategories = buildVisibleCategories(
      this.data.menuCategories,
      selectedMealSlot,
      currentSelection
    );

    let activeCategoryId = this.data.activeCategoryId;
    if (!visibleCategories.some((category) => category.id === activeCategoryId)) {
      activeCategoryId = visibleCategories.length ? visibleCategories[0].id : 0;
    }

    const currentCategory = visibleCategories.find(
      (category) => category.id === activeCategoryId
    );
    const currentCategoryItems = currentCategory ? currentCategory.items : [];
    const cartState = buildCartGroups(
      this.data.slotSelections,
      this.data.menuCategories,
      this.data.mealSlots
    );
    const mealSlotMap = getMealSlotMap(this.data.mealSlots);
    const currentSlotSelectedCount = Object.keys(currentSelection.items || {}).reduce(
      (sum, itemId) => sum + Number(currentSelection.items[itemId] || 0),
      0
    );

    this.setData({
      dateTabs: buildDateTabs(
        this.data.dateOptions,
        selectedDate,
        this.data.slotSelections,
        this.data.myOrders
      ),
      mealTabs: buildMealTabs(
        this.data.mealSlots,
        selectedMealSlot,
        selectedDate,
        this.data.slotSelections
      ),
      activeSlotLabel: `${selectedDate} ${
        mealSlotMap[selectedMealSlot] ? mealSlotMap[selectedMealSlot].label : ""
      }`,
      visibleCategories,
      activeCategoryId,
      currentCategoryItems,
      currentSlotSelectedCount,
      cartGroups: cartState.groups,
      cartSlotCount: cartState.cartSlotCount,
      cartTotalCount: cartState.cartTotalCount,
      cartTotalAmountText: cartState.cartTotalAmountText,
      displayedOrders:
        this.data.orderRecordTab === "recent"
          ? this.data.myOrders.slice(0, 10)
          : this.data.myOrders,
      orderRecordTabs: buildOrderRecordTabs(
        this.data.orderRecordTab,
        this.data.myOrders.length
      ),
      canSubmit: cartState.cartSlotCount > 0,
    });
  },

  async onTapLogin() {
    if (this.data.loginBusy) {
      return;
    }

    this.showPageLoading("登录中");
    try {
      await this.tryLogin(true);
      await this.reloadPage();
      this.hidePageLoading();
      wx.showToast({
        title: "登录成功",
        icon: "success",
      });
    } catch (error) {
      this.hidePageLoading();
      this.showError(error);
    }
  },

  async resolveAssetState(menuCategories, avatarUrl) {
    const fileIDs = [];
    (menuCategories || []).forEach((category) => {
      (category.items || []).forEach((item) => {
        if (item.imageUrl) {
          fileIDs.push(item.imageUrl);
        }
      });
    });
    if (avatarUrl) {
      fileIDs.push(avatarUrl);
    }

    const fileUrlMap = await this.app.resolveFileUrls(fileIDs);
    return {
      avatarPreviewUrl:
        (avatarUrl && fileUrlMap[avatarUrl]) || avatarUrl || DEFAULT_AVATAR,
      menuCategories: (menuCategories || []).map((category) => ({
        ...category,
        items: (category.items || []).map((item) => ({
          ...item,
          displayImageUrl:
            (item.imageUrl && fileUrlMap[item.imageUrl]) ||
            item.imageUrl ||
            DEFAULT_GOODS_IMAGE,
        })),
      })),
    };
  },

  async onChooseProfileAvatar(event) {
    const avatarUrl = event.detail && event.detail.avatarUrl;
    if (!avatarUrl) {
      return;
    }

    this.showPageLoading("上传头像");
    try {
      const fileID = await this.app.uploadFileToCloud({
        filePath: avatarUrl,
        folder: "user-avatars",
      });
      const fileUrlMap = await this.app.resolveFileUrls([fileID]);
      this.setData({
        profileAvatarUrl: fileID,
        profileAvatarPreviewUrl: fileUrlMap[fileID] || avatarUrl,
      });
    } catch (error) {
      this.showError(error);
    } finally {
      this.hidePageLoading();
    }
  },

  async saveProfile() {
    if (!this.data.profileDisplayName.trim()) {
      wx.showToast({
        title: "请填写昵称",
        icon: "none",
      });
      return;
    }

    this.showPageLoading("保存中");
    try {
      const viewer = await this.app.request({
        path: "/api/profile",
        method: "POST",
        data: {
          displayName: this.data.profileDisplayName.trim(),
          avatarUrl: this.data.profileAvatarUrl,
        },
      });
      const fileUrlMap = await this.app.resolveFileUrls([
        (viewer && viewer.avatarUrl) || this.data.profileAvatarUrl,
      ]);
      this.setData({
        viewerLabel: (viewer && viewer.displayName) || this.data.profileDisplayName,
        profileDisplayName:
          (viewer && viewer.displayName) || this.data.profileDisplayName,
        profileAvatarUrl: (viewer && viewer.avatarUrl) || this.data.profileAvatarUrl,
        profileAvatarPreviewUrl:
          ((viewer && viewer.avatarUrl) && fileUrlMap[viewer.avatarUrl]) ||
          (viewer && viewer.avatarUrl) ||
          this.data.profileAvatarPreviewUrl,
        viewerAvatarPreviewUrl:
          ((viewer && viewer.avatarUrl) && fileUrlMap[viewer.avatarUrl]) ||
          (viewer && viewer.avatarUrl) ||
          this.data.profileAvatarPreviewUrl,
      });
      this.hidePageLoading();
      wx.showToast({
        title: "资料已保存",
        icon: "success",
      });
    } catch (error) {
      this.hidePageLoading();
      this.showError(error);
    } finally {
      this.hidePageLoading();
    }
  },

  async requestOrderStatusSubscription() {
    if (!this.data.orderNotificationEnabled || !this.data.orderSubscribeTemplateId) {
      return;
    }

    try {
      await wx.requestSubscribeMessage({
        tmplIds: [this.data.orderSubscribeTemplateId],
      });
    } catch (error) {
      console.warn("request order notification failed", error);
    }
  },

  async onCheckoutTap() {
    if (!this.data.loggedIn) {
      await this.onTapLogin();
      return;
    }

    await this.submitBooking();
  },

  onSwitchTab(event) {
    const tab = event.currentTarget.dataset.tab;
    if (tab === this.data.activeTab) {
      return;
    }
    if (this.getAvailableTabs().indexOf(tab) === -1) {
      return;
    }

    this.setActiveTab(tab);

    if (tab === "admin" && !this.data.adminLoaded) {
      this.reloadAdminData().catch((error) => {
        this.showError(error);
      });
    }
  },

  onSwitchAdminPanel(event) {
    this.setData({
      adminPanel: event.currentTarget.dataset.tab,
    });
  },

  getAvailableTabs() {
    const tabs = ["booking", "orders"];
    if (this.data.isAdmin) {
      tabs.push("admin");
    }
    return tabs;
  },

  setActiveTab(tab) {
    this.setData({
      activeTab: tab,
    });
  },

  onPageTouchStart(event) {
    const touch = (event.touches || [])[0];
    if (!touch) {
      return;
    }
    this.swipeStartX = touch.clientX;
    this.swipeStartY = touch.clientY;
  },

  onPageTouchEnd(event) {
    const tabs = this.getAvailableTabs();
    if (tabs.length < 2) {
      return;
    }

    const touch = (event.changedTouches || [])[0];
    if (!touch || typeof this.swipeStartX !== "number") {
      return;
    }

    const deltaX = touch.clientX - this.swipeStartX;
    const deltaY = touch.clientY - this.swipeStartY;
    this.swipeStartX = null;
    this.swipeStartY = null;

    if (Math.abs(deltaX) < 70 || Math.abs(deltaX) <= Math.abs(deltaY)) {
      return;
    }

    const currentIndex = tabs.indexOf(this.data.activeTab);
    if (currentIndex < 0) {
      return;
    }

    const nextIndex = deltaX < 0 ? currentIndex + 1 : currentIndex - 1;
    if (nextIndex < 0 || nextIndex >= tabs.length) {
      return;
    }

    const nextTab = tabs[nextIndex];
    this.setActiveTab(nextTab);
    if (nextTab === "admin" && !this.data.adminLoaded) {
      this.reloadAdminData().catch((error) => {
        this.showError(error);
      });
    }
  },

  onSelectDate(event) {
    this.setData({
      selectedDate: event.currentTarget.dataset.date,
    });
    this.refreshBookingView();
  },

  onSelectMealSlot(event) {
    this.setData({
      selectedMealSlot: event.currentTarget.dataset.mealSlot,
    });
    this.refreshBookingView();
  },

  onSwitchOrderRecordTab(event) {
    this.setData({
      orderRecordTab: event.currentTarget.dataset.tab,
    });
    this.refreshBookingView();
  },

  onSelectCategory(event) {
    const categoryId = Number(event.currentTarget.dataset.categoryId);
    const currentCategory = this.data.visibleCategories.find(
      (category) => category.id === categoryId
    );

    this.setData({
      activeCategoryId: categoryId,
      currentCategoryItems: currentCategory ? currentCategory.items : [],
    });
  },

  onChangeDishQty(event) {
    const itemId = Number(event.currentTarget.dataset.itemId);
    const delta = Number(event.currentTarget.dataset.delta || 0);
    const slotKey = buildSlotKey(this.data.selectedDate, this.data.selectedMealSlot);
    const slotSelections = clone(this.data.slotSelections);
    const current =
      slotSelections[slotKey] || {
        mealDate: this.data.selectedDate,
        mealSlot: this.data.selectedMealSlot,
        items: {},
      };

    const currentQuantity = Number((current.items || {})[itemId] || 0);
    const nextQuantity = Math.max(0, currentQuantity + delta);
    current.items = current.items || {};

    if (!nextQuantity) {
      delete current.items[itemId];
    } else {
      current.items[itemId] = nextQuantity;
    }

    if (!Object.keys(current.items).length) {
      delete slotSelections[slotKey];
    } else {
      slotSelections[slotKey] = current;
    }

    this.setData({
      slotSelections,
    });
    this.refreshBookingView();
  },

  onClearCartGroup(event) {
    const slotKey = event.currentTarget.dataset.slotKey;
    const slotSelections = clone(this.data.slotSelections);
    delete slotSelections[slotKey];
    this.setData({
      slotSelections,
    });
    this.refreshBookingView();
  },

  buildOrderEntries() {
    const entries = [];

    Object.keys(this.data.slotSelections || {}).forEach((slotKey) => {
      const selection = this.data.slotSelections[slotKey];
      const items = Object.keys(selection.items || {})
        .map((itemId) => ({
          menuItemId: Number(itemId),
          quantity: Number(selection.items[itemId] || 0),
        }))
        .filter((item) => item.quantity > 0);

      if (items.length) {
        entries.push({
          mealDate: selection.mealDate,
          mealSlot: selection.mealSlot,
          items,
        });
      }
    });

    return entries;
  },

  async subscribeAdminNotifications() {
    if (!this.data.adminSubscribeTemplateId) {
      wx.showToast({
        title: "通知模板未配置",
        icon: "none",
      });
      return;
    }

    try {
      const result = await wx.requestSubscribeMessage({
        tmplIds: [this.data.adminSubscribeTemplateId],
      });
      const subscribeStatus = result[this.data.adminSubscribeTemplateId];

      if (subscribeStatus === "accept") {
        wx.showToast({
          title: "已订阅通知",
          icon: "success",
        });
        return;
      }

      wx.showToast({
        title:
          subscribeStatus === "reject"
            ? "你已拒绝订阅"
            : subscribeStatus === "ban"
              ? "通知模板已被封禁"
              : "订阅未生效",
        icon: "none",
      });
    } catch (error) {
      this.showError(error);
    }
  },

  async submitBooking() {
    const entries = this.buildOrderEntries();
    if (!entries.length) {
      wx.showToast({
        title: "先选时间再加菜",
        icon: "none",
      });
      return;
    }

    this.showPageLoading("下单中");
    try {
      await this.requestOrderStatusSubscription();
      await this.app.request({
        path: "/api/orders/batch",
        method: "POST",
        data: {
          remark: this.data.orderRemark.trim(),
          entries,
        },
      });
      this.setData({
        slotSelections: {},
        orderRemark: "",
      });
      await this.reloadPage();
      this.hidePageLoading();
      wx.showToast({
        title: "下单成功",
        icon: "success",
      });
    } catch (error) {
      this.hidePageLoading();
      this.showError(error);
    } finally {
      this.hidePageLoading();
    }
  },

  onCancelOrder(event) {
    const orderId = event.currentTarget.dataset.orderId;
    wx.showModal({
      title: "撤销订单",
      content: "确认撤销这笔订单？",
      success: async (result) => {
        if (!result.confirm) {
          return;
        }
        this.showPageLoading("处理中");
        try {
          await this.app.request({
            path: "/api/orders/action",
            method: "POST",
            data: {
              orderId,
              action: "cancel",
            },
          });
          await this.reloadPage();
          this.hidePageLoading();
          wx.showToast({
            title: "已撤销",
            icon: "success",
          });
        } catch (error) {
          this.hidePageLoading();
          this.showError(error);
        } finally {
          this.hidePageLoading();
        }
      },
    });
  },

  onInputChange(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({
      [field]: event.detail.value,
    });
  },

  onCategoryEnabledChange(event) {
    this.setData({
      categoryEnabled: !!event.detail.value,
    });
  },

  onMenuCategoryChange(event) {
    const nextIndex = Number(event.detail.value);
    const option = (this.data.menuCategoryOptions || [])[nextIndex];
    this.setData({
      menuCategoryIndex: nextIndex,
      selectedMenuCategoryName: option ? option.name : "请先新增分类",
    });
  },

  onMenuMealSlotsChange(event) {
    this.setData({
      menuMealSlots: event.detail.value,
      adminMealSlotChoices: buildAdminMealSlotChoices(
        this.data.mealSlots,
        event.detail.value
      ),
    });
  },

  onMenuEnabledChange(event) {
    this.setData({
      menuEnabled: !!event.detail.value,
    });
  },

  resetCategoryForm() {
    this.setData({
      categoryEditingId: 0,
      categoryName: "",
      categorySort: "10",
      categoryEnabled: true,
    });
  },

  startEditCategory(event) {
    const categoryId = Number(event.currentTarget.dataset.categoryId);
    const category = findCategory(this.data.menuCategories, categoryId);
    if (!category) {
      return;
    }

    this.setData({
      adminPanel: "category",
      categoryEditingId: category.id,
      categoryName: category.name,
      categorySort: `${category.sort || 10}`,
      categoryEnabled: category.enabled !== false,
    });
    this.scrollToSelector("#admin-category-form");
  },

  async onToggleCategoryStatus(event) {
    const categoryId = Number(event.currentTarget.dataset.categoryId);
    const nextEnabled = !!event.detail.value;
    const category = findCategory(this.data.menuCategories, categoryId);
    if (!category) {
      return;
    }

    try {
      await this.app.request({
        path: "/api/admin/categories",
        method: "POST",
        admin: true,
        data: {
          action: "update",
          category: {
            id: category.id,
            name: category.name,
            sort: category.sort,
            enabled: nextEnabled,
          },
        },
      });
      await this.reloadPage();
    } catch (error) {
      this.showError(error);
    }
  },

  async submitCategory() {
    if (!this.data.categoryName.trim()) {
      wx.showToast({
        title: "请填写分类名称",
        icon: "none",
      });
      return;
    }

    try {
      const isEditing = !!this.data.categoryEditingId;
      await this.app.request({
        path: "/api/admin/categories",
        method: "POST",
        admin: true,
        data: {
          action: isEditing ? "update" : "create",
          category: {
            id: this.data.categoryEditingId,
            name: this.data.categoryName.trim(),
            sort: Number(this.data.categorySort || 10),
            enabled: this.data.categoryEnabled,
          },
        },
      });
      this.resetCategoryForm();
      await this.reloadPage();
      wx.showToast({
        title: isEditing ? "分类已更新" : "分类已新增",
        icon: "success",
      });
    } catch (error) {
      this.showError(error);
    }
  },

  resetMenuForm() {
    this.setData({
      menuEditingId: 0,
      menuName: "",
      menuDescription: "",
      menuImageUrl: "",
      menuImagePreviewUrl: DEFAULT_GOODS_IMAGE,
      menuPrice: "",
      menuSort: "10",
      menuMealSlots: [],
      menuEnabled: true,
      adminMealSlotChoices: buildAdminMealSlotChoices(this.data.mealSlots, []),
    });
  },

  startEditMenuItem(event) {
    const itemId = Number(event.currentTarget.dataset.itemId);
    const menuItem = findMenuItem(this.data.menuCategories, itemId);
    if (!menuItem) {
      return;
    }

    const nextIndex = findCategoryIndex(
      this.data.menuCategoryOptions,
      menuItem.categoryId
    );
    const category = this.data.menuCategoryOptions[nextIndex] || null;

    this.setData({
      adminPanel: "menu",
      menuEditingId: menuItem.id,
      menuName: menuItem.name,
      menuDescription: menuItem.description,
      menuImageUrl: menuItem.imageUrl || "",
      menuImagePreviewUrl: menuItem.displayImageUrl || DEFAULT_GOODS_IMAGE,
      menuPrice: `${menuItem.price}`,
      menuSort: `${menuItem.sort || 10}`,
      menuMealSlots: (menuItem.mealSlots || []).slice(),
      menuEnabled: menuItem.enabled !== false,
      menuCategoryIndex: nextIndex > -1 ? nextIndex : this.data.menuCategoryIndex,
      selectedMenuCategoryName: category ? category.name : this.data.selectedMenuCategoryName,
      adminMealSlotChoices: buildAdminMealSlotChoices(
        this.data.mealSlots,
        menuItem.mealSlots || []
      ),
    });
    this.scrollToSelector("#admin-menu-form");
  },

  scrollToSelector(selector) {
    setTimeout(() => {
      wx.pageScrollTo({
        selector,
        duration: 260,
      });
    }, 50);
  },

  async onChooseMenuImage() {
    try {
      const response = await chooseImage();
      const filePath = (response.tempFilePaths || [])[0];
      if (!filePath) {
        return;
      }

      this.showPageLoading("上传图片");
      const fileID = await this.app.uploadFileToCloud({
        filePath,
        folder: "menu-images",
      });
      const fileUrlMap = await this.app.resolveFileUrls([fileID]);
      this.setData({
        menuImageUrl: fileID,
        menuImagePreviewUrl: fileUrlMap[fileID] || filePath,
      });
    } catch (error) {
      if (error && error.errMsg && error.errMsg.indexOf("cancel") > -1) {
        return;
      }
      this.showError(error);
    } finally {
      this.hidePageLoading();
    }
  },

  async submitMenuItem() {
    const category = this.data.menuCategoryOptions[this.data.menuCategoryIndex];
    if (!category) {
      wx.showToast({
        title: "请先新增分类",
        icon: "none",
      });
      return;
    }
    if (!this.data.menuName.trim()) {
      wx.showToast({
        title: "请填写菜品名称",
        icon: "none",
      });
      return;
    }
    if (!this.data.menuMealSlots.length) {
      wx.showToast({
        title: "请选择供应餐次",
        icon: "none",
      });
      return;
    }

    try {
      const isEditing = !!this.data.menuEditingId;
      await this.app.request({
        path: "/api/admin/menu-items",
        method: "POST",
        admin: true,
        data: {
          action: isEditing ? "update" : "create",
          item: {
            id: this.data.menuEditingId,
            categoryId: category.id,
            name: this.data.menuName.trim(),
            description: this.data.menuDescription.trim(),
            imageUrl: this.data.menuImageUrl,
            price: Number(this.data.menuPrice || 0),
            sort: Number(this.data.menuSort || 10),
            enabled: this.data.menuEnabled,
            mealSlots: this.data.menuMealSlots,
          },
        },
      });
      this.resetMenuForm();
      await this.reloadPage();
      wx.showToast({
        title: isEditing ? "菜品已更新" : "菜品已新增",
        icon: "success",
      });
    } catch (error) {
      this.showError(error);
    }
  },

  async onToggleMenuStatus(event) {
    const itemId = Number(event.currentTarget.dataset.itemId);
    const nextEnabled = !!event.detail.value;
    const menuItem = findMenuItem(this.data.menuCategories, itemId);
    if (!menuItem) {
      return;
    }

    try {
      await this.app.request({
        path: "/api/admin/menu-items",
        method: "POST",
        admin: true,
        data: {
          action: "update",
          item: {
            id: menuItem.id,
            categoryId: menuItem.categoryId,
            name: menuItem.name,
            description: menuItem.description,
            imageUrl: menuItem.imageUrl,
            price: menuItem.price,
            sort: menuItem.sort,
            enabled: nextEnabled,
            mealSlots: menuItem.mealSlots,
          },
        },
      });
      await this.reloadPage();
    } catch (error) {
      this.showError(error);
    }
  },

  onReviewWorkOrder(event) {
    const orderId = Number(event.currentTarget.dataset.orderId);
    const action = event.currentTarget.dataset.action;
    const actionText = action === "approve" ? "受理" : "驳回";

    wx.showModal({
      title: `${actionText}工单`,
      content:
        action === "approve"
          ? "确认受理这笔订单？"
          : "确认驳回这笔订单？",
      success: async (result) => {
        if (!result.confirm) {
          return;
        }
        try {
          await this.app.request({
            path: "/api/admin/orders/action",
            method: "POST",
            admin: true,
            data: {
              orderId,
              action,
            },
          });
          await this.reloadPage();
          wx.showToast({
            title: `${actionText}完成`,
            icon: "success",
          });
        } catch (error) {
          this.showError(error);
        }
      },
    });
  },

  showError(error) {
    wx.showToast({
      title: error && error.message ? error.message : "操作失败",
      icon: "none",
      duration: 2500,
    });
  },
});
