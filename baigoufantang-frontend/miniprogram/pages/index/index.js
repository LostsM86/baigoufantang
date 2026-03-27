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

const DEFAULT_DATE_OPTIONS = buildNextSevenDays();
const DEFAULT_SELECTED_DATE = DEFAULT_DATE_OPTIONS.length
  ? DEFAULT_DATE_OPTIONS[0].date
  : "";

function clone(value) {
  return JSON.parse(JSON.stringify(value || {}));
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
    isAdmin: false,
    viewerLabel: "微信用户",
    adminNotificationEnabled: false,
    adminSubscribeTemplateId: "",
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
    canSubmit: false,
    myOrders: [],
    workOrders: [],
    adminLoaded: false,
    categoryName: "",
    categorySort: "10",
    menuName: "",
    menuDescription: "",
    menuPrice: "",
    menuSort: "10",
    menuCategoryIndex: 0,
    menuMealSlots: [],
    menuEnabled: true,
    menuCategoryOptions: [],
    selectedMenuCategoryName: "请先新增分类",
    adminMealSlotChoices: buildAdminMealSlotChoices(DEFAULT_MEAL_SLOTS, []),
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
          (response.viewer && response.viewer.openidMasked) || this.data.viewerLabel,
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
      const mealSlotMap = getMealSlotMap(mealSlots);
      const myOrders = buildOrderCards(response.myOrders, mealSlotMap);
      const categoryState = buildMenuCategoryState(
        menuCategories,
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
          (response.viewer && response.viewer.openidMasked) || "微信用户",
        adminNotificationEnabled: !!(
          response.adminNotification && response.adminNotification.enabled
        ),
        adminSubscribeTemplateId:
          (response.adminNotification &&
            response.adminNotification.subscribeTemplateId) ||
          "",
        mealSlots,
        dateOptions,
        selectedDate,
        selectedMealSlot,
        menuCategories,
        myOrders,
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
    const menuCategories = normalizeCategories(
      response.categories,
      this.data.mealSlots
    );
    const mealSlotMap = getMealSlotMap(this.data.mealSlots);
    const categoryState = buildMenuCategoryState(
      menuCategories,
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
      menuCategories,
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
      canSubmit: cartState.cartSlotCount > 0,
    });
  },

  async onTapLogin() {
    if (this.data.loginBusy) {
      return;
    }

    wx.showLoading({
      title: "登录中",
    });
    try {
      await this.tryLogin(true);
      await this.reloadPage();
      wx.showToast({
        title: "登录成功",
        icon: "success",
      });
    } catch (error) {
      this.showError(error);
    } finally {
      wx.hideLoading();
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
    if (tab === "admin" && !this.data.isAdmin) {
      return;
    }

    this.setData({
      activeTab: tab,
    });

    if (tab === "admin" && !this.data.adminLoaded) {
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

    wx.showLoading({
      title: "下单中",
    });
    try {
      await this.app.request({
        path: "/api/orders/batch",
        method: "POST",
        data: {
          entries,
        },
      });
      this.setData({
        slotSelections: {},
      });
      await this.reloadPage();
      wx.showToast({
        title: "下单成功",
        icon: "success",
      });
    } catch (error) {
      this.showError(error);
    } finally {
      wx.hideLoading();
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
        wx.showLoading({
          title: "处理中",
        });
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
          wx.showToast({
            title: "已撤销",
            icon: "success",
          });
        } catch (error) {
          this.showError(error);
        } finally {
          wx.hideLoading();
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

  async createCategory() {
    if (!this.data.categoryName.trim()) {
      wx.showToast({
        title: "请填写分类名称",
        icon: "none",
      });
      return;
    }

    try {
      await this.app.request({
        path: "/api/admin/categories",
        method: "POST",
        admin: true,
        data: {
          action: "create",
          category: {
            name: this.data.categoryName.trim(),
            sort: Number(this.data.categorySort || 10),
          },
        },
      });
      this.setData({
        categoryName: "",
        categorySort: "10",
      });
      await this.reloadPage();
      wx.showToast({
        title: "分类已新增",
        icon: "success",
      });
    } catch (error) {
      this.showError(error);
    }
  },

  async createMenuItem() {
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
      await this.app.request({
        path: "/api/admin/menu-items",
        method: "POST",
        admin: true,
        data: {
          action: "create",
          item: {
            categoryId: category.id,
            name: this.data.menuName.trim(),
            description: this.data.menuDescription.trim(),
            price: Number(this.data.menuPrice || 0),
            sort: Number(this.data.menuSort || 10),
            enabled: this.data.menuEnabled,
            mealSlots: this.data.menuMealSlots,
          },
        },
      });
      this.setData({
        menuName: "",
        menuDescription: "",
        menuPrice: "",
        menuSort: "10",
        menuMealSlots: [],
        menuEnabled: true,
        adminMealSlotChoices: buildAdminMealSlotChoices(this.data.mealSlots, []),
      });
      await this.reloadPage();
      wx.showToast({
        title: "菜品已新增",
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
