package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"
	"wxcloudrun-golang/db"
	"wxcloudrun-golang/db/model"

	"gorm.io/gorm"
)

const (
	adminTokenDefault = "baigoufantang-admin"

	orderStatusPending   = "pending"
	orderStatusApproved  = "approved"
	orderStatusRejected  = "rejected"
	orderStatusCancelled = "cancelled"

	workOrderStatusPending   = "pending"
	workOrderStatusProcessed = "processed"
	workOrderStatusRejected  = "rejected"
	workOrderStatusCancelled = "cancelled"

	dishRequestStatusPending  = "pending"
	dishRequestStatusAccepted = "accepted"
	dishRequestStatusRejected = "rejected"
)

var mealSlots = []mealSlotOption{
	{Value: "breakfast", Label: "早餐", ShortLabel: "早", Order: 1},
	{Value: "lunch", Label: "午餐", ShortLabel: "午", Order: 2},
	{Value: "dinner", Label: "晚餐", ShortLabel: "晚", Order: 3},
	{Value: "night_snack", Label: "夜宵", ShortLabel: "宵", Order: 4},
}

type mealSlotOption struct {
	Value      string `json:"value"`
	Label      string `json:"label"`
	ShortLabel string `json:"shortLabel"`
	Order      int    `json:"order"`
}

type dateOption struct {
	Date    string `json:"date"`
	Title   string `json:"title"`
	Weekday string `json:"weekday"`
}

type viewerDTO struct {
	OpenIDMasked string `json:"openidMasked"`
	IsAdmin      bool   `json:"isAdmin"`
	DisplayName  string `json:"displayName"`
	AvatarURL    string `json:"avatarUrl"`
}

type bootstrapResponse struct {
	Viewer            viewerDTO             `json:"viewer"`
	AdminNotification notificationConfigDTO `json:"adminNotification"`
	OrderNotification notificationConfigDTO `json:"orderNotification"`
	MealSlots         []mealSlotOption      `json:"mealSlots"`
	DateOptions       []dateOption          `json:"dateOptions"`
	Categories        []categoryDTO         `json:"categories"`
	MyOrders          []orderDTO            `json:"myOrders"`
	MyDishRequests    []dishRequestDTO      `json:"myDishRequests"`
}

type adminBootstrapResponse struct {
	Viewer            viewerDTO             `json:"viewer"`
	AdminNotification notificationConfigDTO `json:"adminNotification"`
	Categories        []categoryDTO         `json:"categories"`
	WorkOrders        []workOrderDTO        `json:"workOrders"`
	DishRequests      []dishRequestDTO      `json:"dishRequests"`
}

type notificationConfigDTO struct {
	Enabled             bool   `json:"enabled"`
	SubscribeTemplateID string `json:"subscribeTemplateId"`
}

type categoryDTO struct {
	ID      uint          `json:"id"`
	Name    string        `json:"name"`
	Sort    int           `json:"sort"`
	Enabled bool          `json:"enabled"`
	Items   []menuItemDTO `json:"items"`
}

type menuItemDTO struct {
	ID          uint     `json:"id"`
	CategoryID  uint     `json:"categoryId"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	ImageURL    string   `json:"imageUrl"`
	Price       float64  `json:"price"`
	MealSlots   []string `json:"mealSlots"`
	Sort        int      `json:"sort"`
	Enabled     bool     `json:"enabled"`
}

type orderDTO struct {
	ID           uint           `json:"id"`
	OrderNo      string         `json:"orderNo"`
	RequesterID  string         `json:"requesterId"`
	UserName     string         `json:"userName"`
	ContactPhone string         `json:"contactPhone"`
	MealDate     string         `json:"mealDate"`
	MealSlot     string         `json:"mealSlot"`
	Status       string         `json:"status"`
	Remark       string         `json:"remark"`
	RejectReason string         `json:"rejectReason"`
	CreatedAt    time.Time      `json:"createdAt"`
	Items        []orderItemDTO `json:"items"`
}

type orderItemDTO struct {
	ID         uint    `json:"id"`
	MenuItemID uint    `json:"menuItemId"`
	Name       string  `json:"name"`
	Price      float64 `json:"price"`
	Quantity   int     `json:"quantity"`
}

type workOrderDTO struct {
	ID        uint      `json:"id"`
	OrderID   uint      `json:"orderId"`
	Title     string    `json:"title"`
	Detail    string    `json:"detail"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"createdAt"`
	Order     orderDTO  `json:"order"`
}

type dishRequestDTO struct {
	ID            uint      `json:"id"`
	RequesterID   string    `json:"requesterId"`
	UserName      string    `json:"userName"`
	DishName      string    `json:"dishName"`
	Status        string    `json:"status"`
	StatusText    string    `json:"statusText"`
	AdminReply    string    `json:"adminReply"`
	CreatedAt     time.Time `json:"createdAt"`
	CreatedAtText string    `json:"createdAtText"`
}

type createBatchOrderRequest struct {
	Remark  string             `json:"remark"`
	Entries []createOrderEntry `json:"entries"`
}

type createOrderEntry struct {
	MealDate string                 `json:"mealDate"`
	MealSlot string                 `json:"mealSlot"`
	Items    []createOrderEntryItem `json:"items"`
}

type createOrderEntryItem struct {
	MenuItemID uint `json:"menuItemId"`
	Quantity   int  `json:"quantity"`
}

type createDishRequestRequest struct {
	DishName string `json:"dishName"`
}

type orderActionRequest struct {
	OrderID uint   `json:"orderId"`
	Action  string `json:"action"`
}

type adminCategoryRequest struct {
	Action   string               `json:"action"`
	Category adminCategoryPayload `json:"category"`
}

type adminCategoryPayload struct {
	ID      uint   `json:"id"`
	Name    string `json:"name"`
	Sort    int    `json:"sort"`
	Enabled bool   `json:"enabled"`
}

type adminMenuItemRequest struct {
	Action string               `json:"action"`
	Item   adminMenuItemPayload `json:"item"`
}

type adminMenuItemPayload struct {
	ID          uint     `json:"id"`
	CategoryID  uint     `json:"categoryId"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	ImageURL    string   `json:"imageUrl"`
	Price       float64  `json:"price"`
	MealSlots   []string `json:"mealSlots"`
	Sort        int      `json:"sort"`
	Enabled     bool     `json:"enabled"`
}

type adminOrderActionRequest struct {
	OrderID uint   `json:"orderId"`
	Action  string `json:"action"`
	Reason  string `json:"reason"`
}

type adminDishRequestActionRequest struct {
	RequestID uint   `json:"requestId"`
	Action    string `json:"action"`
}

type saveProfileRequest struct {
	DisplayName string `json:"displayName"`
	AvatarURL   string `json:"avatarUrl"`
}

func BootstrapHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, fmt.Errorf("请求方法 %s 不支持", r.Method))
		return
	}

	requesterID := getRequesterID(r)
	categories, err := listCategories(false)
	if err != nil {
		writeError(w, err)
		return
	}

	orders, err := listOrdersByRequester(requesterID)
	if err != nil {
		writeError(w, err)
		return
	}
	dishRequests, err := listDishRequestsByRequester(requesterID)
	if err != nil {
		writeError(w, err)
		return
	}

	writeData(w, bootstrapResponse{
		Viewer:            buildViewer(requesterID),
		AdminNotification: buildAdminNotificationConfig(requesterID),
		OrderNotification: buildOrderNotificationConfig(requesterID),
		MealSlots:         mealSlots,
		DateOptions:       buildNextSevenDays(),
		Categories:        categories,
		MyOrders:          orders,
		MyDishRequests:    dishRequests,
	})
}

func AdminBootstrapHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, fmt.Errorf("请求方法 %s 不支持", r.Method))
		return
	}
	if !ensureAdmin(w, r) {
		return
	}

	requesterID := getRequesterID(r)
	categories, err := listCategories(true)
	if err != nil {
		writeError(w, err)
		return
	}

	workOrders, err := listWorkOrders()
	if err != nil {
		writeError(w, err)
		return
	}
	dishRequests, err := listAllDishRequests()
	if err != nil {
		writeError(w, err)
		return
	}

	writeData(w, adminBootstrapResponse{
		Viewer:            buildViewer(requesterID),
		AdminNotification: buildAdminNotificationConfig(requesterID),
		Categories:        categories,
		WorkOrders:        workOrders,
		DishRequests:      dishRequests,
	})
}

func ProfileHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, fmt.Errorf("请求方法 %s 不支持", r.Method))
		return
	}

	requesterID := getRequesterID(r)
	if strings.TrimSpace(requesterID) == "" {
		writeError(w, errors.New("未获取到微信身份，请重新进入小程序后再试"))
		return
	}

	var req saveProfileRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, err)
		return
	}
	if err := saveUserProfile(requesterID, req); err != nil {
		writeError(w, err)
		return
	}

	writeData(w, buildViewer(requesterID))
}

func OrderBatchHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, fmt.Errorf("请求方法 %s 不支持", r.Method))
		return
	}

	requesterID := getRequesterID(r)
	var req createBatchOrderRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, err)
		return
	}
	if err := createOrders(requesterID, req); err != nil {
		writeError(w, err)
		return
	}

	writeData(w, map[string]int{"createdCount": len(req.Entries)})
}

func DishRequestHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, fmt.Errorf("请求方法 %s 不支持", r.Method))
		return
	}

	requesterID := getRequesterID(r)
	var req createDishRequestRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, err)
		return
	}
	if err := createDishRequest(requesterID, req); err != nil {
		writeError(w, err)
		return
	}

	writeData(w, map[string]bool{"success": true})
}

func OrderActionHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, fmt.Errorf("请求方法 %s 不支持", r.Method))
		return
	}

	requesterID := getRequesterID(r)
	var req orderActionRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, err)
		return
	}
	if err := handleOrderAction(requesterID, req); err != nil {
		writeError(w, err)
		return
	}

	writeData(w, map[string]bool{"success": true})
}

func AdminCategoryHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, fmt.Errorf("请求方法 %s 不支持", r.Method))
		return
	}
	if !ensureAdmin(w, r) {
		return
	}

	var req adminCategoryRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, err)
		return
	}
	if err := saveCategory(req); err != nil {
		writeError(w, err)
		return
	}

	writeData(w, map[string]bool{"success": true})
}

func AdminMenuItemHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, fmt.Errorf("请求方法 %s 不支持", r.Method))
		return
	}
	if !ensureAdmin(w, r) {
		return
	}

	var req adminMenuItemRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, err)
		return
	}
	if err := saveMenuItem(req); err != nil {
		writeError(w, err)
		return
	}

	writeData(w, map[string]bool{"success": true})
}

func AdminOrderActionHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, fmt.Errorf("请求方法 %s 不支持", r.Method))
		return
	}
	if !ensureAdmin(w, r) {
		return
	}

	var req adminOrderActionRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, err)
		return
	}
	if err := reviewOrder(req); err != nil {
		writeError(w, err)
		return
	}

	writeData(w, map[string]bool{"success": true})
}

func AdminDishRequestActionHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, fmt.Errorf("请求方法 %s 不支持", r.Method))
		return
	}
	if !ensureAdmin(w, r) {
		return
	}

	var req adminDishRequestActionRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, err)
		return
	}
	if err := handleDishRequestAction(req); err != nil {
		writeError(w, err)
		return
	}

	writeData(w, map[string]bool{"success": true})
}

func writeData(w http.ResponseWriter, data interface{}) {
	writeJSON(w, JsonResult{
		Code: 0,
		Data: data,
	})
}

func writeError(w http.ResponseWriter, err error) {
	writeJSON(w, JsonResult{
		Code:     -1,
		ErrorMsg: err.Error(),
		Data:     nil,
	})
}

func writeJSON(w http.ResponseWriter, result JsonResult) {
	message, err := json.Marshal(result)
	if err != nil {
		http.Error(w, "内部错误", http.StatusInternalServerError)
		return
	}
	w.Header().Set("content-type", "application/json")
	_, _ = w.Write(message)
}

func decodeBody(r *http.Request, target interface{}) error {
	defer r.Body.Close()
	decoder := json.NewDecoder(r.Body)
	return decoder.Decode(target)
}

func buildViewer(requesterID string) viewerDTO {
	displayName := buildRequesterLabel(requesterID)
	avatarURL := ""

	profile, err := loadUserProfile(requesterID)
	if err == nil && profile != nil {
		if strings.TrimSpace(profile.DisplayName) != "" {
			displayName = strings.TrimSpace(profile.DisplayName)
		}
		avatarURL = strings.TrimSpace(profile.AvatarURL)
	}

	return viewerDTO{
		OpenIDMasked: maskRequesterID(requesterID),
		IsAdmin:      isAdminRequester(requesterID),
		DisplayName:  displayName,
		AvatarURL:    avatarURL,
	}
}

func getRequesterID(r *http.Request) string {
	sessionToken := strings.TrimSpace(r.Header.Get("X-User-Session"))
	if sessionToken != "" {
		requesterID, err := parseSessionToken(sessionToken)
		if err == nil && requesterID != "" {
			return requesterID
		}
	}

	requesterID := strings.TrimSpace(r.Header.Get("X-User-Openid"))
	if requesterID != "" {
		return requesterID
	}
	return strings.TrimSpace(r.URL.Query().Get("requesterId"))
}

func isAdminRequester(requesterID string) bool {
	requesterID = strings.TrimSpace(requesterID)
	if requesterID == "" {
		return false
	}

	for _, openid := range strings.Split(os.Getenv("ADMIN_OPENIDS"), ",") {
		if strings.TrimSpace(openid) == requesterID {
			return true
		}
	}
	return false
}

func ensureAdmin(w http.ResponseWriter, r *http.Request) bool {
	requesterID := getRequesterID(r)
	if isAdminRequester(requesterID) {
		return true
	}

	expectedToken := strings.TrimSpace(os.Getenv("ADMIN_TOKEN"))
	if expectedToken == "" {
		expectedToken = adminTokenDefault
	}

	token := strings.TrimSpace(r.Header.Get("X-Admin-Token"))
	if token != "" && token == expectedToken {
		return true
	}

	writeError(w, errors.New("当前微信身份没有管理员权限"))
	return false
}

func maskRequesterID(requesterID string) string {
	requesterID = strings.TrimSpace(requesterID)
	if requesterID == "" {
		return "微信用户"
	}
	if len(requesterID) <= 10 {
		return "微信用户"
	}
	return fmt.Sprintf("微信用户 %s...%s", requesterID[:3], requesterID[len(requesterID)-4:])
}

func buildRequesterLabel(requesterID string) string {
	requesterID = strings.TrimSpace(requesterID)
	if requesterID == "" {
		return "微信用户"
	}
	return "微信用户"
}

func buildNextSevenDays() []dateOption {
	weekdays := []string{"周日", "周一", "周二", "周三", "周四", "周五", "周六"}
	now := time.Now()
	options := make([]dateOption, 0, 7)

	for i := 0; i < 7; i++ {
		current := time.Date(now.Year(), now.Month(), now.Day()+i, 0, 0, 0, 0, now.Location())
		title := current.Format("01/02")
		if i == 0 {
			title = "今天"
		} else if i == 1 {
			title = "明天"
		}
		options = append(options, dateOption{
			Date:    current.Format("2006-01-02"),
			Title:   title,
			Weekday: weekdays[current.Weekday()],
		})
	}

	return options
}

func buildMealSlotLabelMap() map[string]mealSlotOption {
	result := make(map[string]mealSlotOption, len(mealSlots))
	for _, slot := range mealSlots {
		result[slot.Value] = slot
	}
	return result
}

func listCategories(includeDisabled bool) ([]categoryDTO, error) {
	database := db.Get()
	categoryQuery := database.Order("sort ASC").Order("id ASC")
	itemQuery := database.Order("sort ASC").Order("id ASC")

	if !includeDisabled {
		categoryQuery = categoryQuery.Where("enabled = ?", true)
		itemQuery = itemQuery.Where("enabled = ?", true)
	}

	var categories []model.Category
	if err := categoryQuery.Find(&categories).Error; err != nil {
		return nil, err
	}

	var items []model.MenuItem
	if err := itemQuery.Find(&items).Error; err != nil {
		return nil, err
	}

	itemsByCategory := make(map[uint][]menuItemDTO, len(categories))
	for _, item := range items {
		itemsByCategory[item.CategoryID] = append(itemsByCategory[item.CategoryID], menuItemDTO{
			ID:          item.ID,
			CategoryID:  item.CategoryID,
			Name:        item.Name,
			Description: item.Description,
			ImageURL:    item.ImageURL,
			Price:       item.Price,
			MealSlots:   deserializeMealSlots(item.MealSlots),
			Sort:        item.Sort,
			Enabled:     item.Enabled,
		})
	}

	result := make([]categoryDTO, 0, len(categories))
	for _, category := range categories {
		result = append(result, categoryDTO{
			ID:      category.ID,
			Name:    category.Name,
			Sort:    category.Sort,
			Enabled: category.Enabled,
			Items:   itemsByCategory[category.ID],
		})
	}

	return result, nil
}

func listOrdersByRequester(requesterID string) ([]orderDTO, error) {
	if strings.TrimSpace(requesterID) == "" {
		return []orderDTO{}, nil
	}

	var orders []model.Order
	if err := db.Get().
		Where("requester_id = ?", requesterID).
		Order("created_at DESC").
		Order("id DESC").
		Find(&orders).Error; err != nil {
		return nil, err
	}

	return hydrateOrders(orders)
}

func listWorkOrders() ([]workOrderDTO, error) {
	var workOrders []model.WorkOrder
	if err := db.Get().
		Order("updated_at DESC").
		Order("id DESC").
		Find(&workOrders).Error; err != nil {
		return nil, err
	}

	orderIDs := make([]uint, 0, len(workOrders))
	for _, workOrder := range workOrders {
		orderIDs = append(orderIDs, workOrder.OrderID)
	}

	ordersMap, err := loadOrdersMap(orderIDs)
	if err != nil {
		return nil, err
	}

	result := make([]workOrderDTO, 0, len(workOrders))
	for _, workOrder := range workOrders {
		result = append(result, workOrderDTO{
			ID:        workOrder.ID,
			OrderID:   workOrder.OrderID,
			Title:     workOrder.Title,
			Detail:    workOrder.Detail,
			Status:    workOrder.Status,
			CreatedAt: workOrder.CreatedAt,
			Order:     ordersMap[workOrder.OrderID],
		})
	}

	return result, nil
}

func listDishRequestsByRequester(requesterID string) ([]dishRequestDTO, error) {
	if strings.TrimSpace(requesterID) == "" {
		return []dishRequestDTO{}, nil
	}

	var requests []model.DishRequest
	if err := db.Get().
		Where("requester_id = ?", requesterID).
		Order("created_at DESC").
		Order("id DESC").
		Find(&requests).Error; err != nil {
		return nil, err
	}
	return hydrateDishRequests(requests), nil
}

func listAllDishRequests() ([]dishRequestDTO, error) {
	var requests []model.DishRequest
	if err := db.Get().
		Order("updated_at DESC").
		Order("id DESC").
		Find(&requests).Error; err != nil {
		return nil, err
	}
	return hydrateDishRequests(requests), nil
}

func hydrateDishRequests(requests []model.DishRequest) []dishRequestDTO {
	result := make([]dishRequestDTO, 0, len(requests))
	for _, item := range requests {
		result = append(result, dishRequestDTO{
			ID:            item.ID,
			RequesterID:   item.RequesterID,
			UserName:      item.UserName,
			DishName:      item.DishName,
			Status:        item.Status,
			StatusText:    dishRequestStatusText(item.Status),
			AdminReply:    item.AdminReply,
			CreatedAt:     item.CreatedAt,
			CreatedAtText: item.CreatedAt.Format("2006-01-02 15:04"),
		})
	}
	return result
}

func hydrateOrders(orders []model.Order) ([]orderDTO, error) {
	orderIDs := make([]uint, 0, len(orders))
	for _, order := range orders {
		orderIDs = append(orderIDs, order.ID)
	}

	orderItemsMap, err := loadOrderItems(orderIDs)
	if err != nil {
		return nil, err
	}

	result := make([]orderDTO, 0, len(orders))
	for _, order := range orders {
		result = append(result, orderDTO{
			ID:           order.ID,
			OrderNo:      order.OrderNo,
			RequesterID:  order.RequesterID,
			UserName:     order.UserName,
			ContactPhone: order.ContactPhone,
			MealDate:     order.MealDate,
			MealSlot:     order.MealSlot,
			Status:       order.Status,
			Remark:       order.Remark,
			RejectReason: order.RejectReason,
			CreatedAt:    order.CreatedAt,
			Items:        orderItemsMap[order.ID],
		})
	}

	return result, nil
}

func loadOrdersMap(orderIDs []uint) (map[uint]orderDTO, error) {
	result := map[uint]orderDTO{}
	if len(orderIDs) == 0 {
		return result, nil
	}

	var orders []model.Order
	if err := db.Get().Where("id IN ?", orderIDs).Find(&orders).Error; err != nil {
		return nil, err
	}

	orderItemsMap, err := loadOrderItems(orderIDs)
	if err != nil {
		return nil, err
	}

	for _, order := range orders {
		result[order.ID] = orderDTO{
			ID:           order.ID,
			OrderNo:      order.OrderNo,
			RequesterID:  order.RequesterID,
			UserName:     order.UserName,
			ContactPhone: order.ContactPhone,
			MealDate:     order.MealDate,
			MealSlot:     order.MealSlot,
			Status:       order.Status,
			Remark:       order.Remark,
			RejectReason: order.RejectReason,
			CreatedAt:    order.CreatedAt,
			Items:        orderItemsMap[order.ID],
		}
	}

	return result, nil
}

func loadOrderItems(orderIDs []uint) (map[uint][]orderItemDTO, error) {
	result := map[uint][]orderItemDTO{}
	if len(orderIDs) == 0 {
		return result, nil
	}

	var items []model.OrderItem
	if err := db.Get().
		Where("order_id IN ?", orderIDs).
		Order("id ASC").
		Find(&items).Error; err != nil {
		return nil, err
	}

	for _, item := range items {
		result[item.OrderID] = append(result[item.OrderID], orderItemDTO{
			ID:         item.ID,
			MenuItemID: item.MenuItemID,
			Name:       item.Name,
			Price:      item.Price,
			Quantity:   item.Quantity,
		})
	}

	return result, nil
}

func createOrders(requesterID string, req createBatchOrderRequest) error {
	requesterID = strings.TrimSpace(requesterID)
	req.Remark = strings.TrimSpace(req.Remark)

	if requesterID == "" {
		return errors.New("未获取到微信身份，请重新进入小程序后再试")
	}
	if len(req.Entries) == 0 {
		return errors.New("至少需要一个预约餐次")
	}

	seenSlots := make(map[string]bool, len(req.Entries))
	menuItemIDs := make([]uint, 0)
	for _, entry := range req.Entries {
		if err := validateMealDate(entry.MealDate); err != nil {
			return err
		}
		if _, ok := buildMealSlotLabelMap()[entry.MealSlot]; !ok {
			return fmt.Errorf("餐次 %s 不支持", entry.MealSlot)
		}
		key := fmt.Sprintf("%s#%s", entry.MealDate, entry.MealSlot)
		if seenSlots[key] {
			return fmt.Errorf("餐次 %s 重复提交", key)
		}
		seenSlots[key] = true
		if len(entry.Items) == 0 {
			return fmt.Errorf("%s %s 至少选择一道菜", entry.MealDate, entry.MealSlot)
		}
		for _, item := range entry.Items {
			if item.MenuItemID == 0 {
				return errors.New("存在非法菜品")
			}
			if item.Quantity <= 0 {
				return errors.New("菜品数量必须大于 0")
			}
			menuItemIDs = append(menuItemIDs, item.MenuItemID)
		}
	}

	menuItemsMap, err := loadMenuItemsMap(menuItemIDs)
	if err != nil {
		return err
	}

	notifications := make([]orderNotificationPayload, 0, len(req.Entries))
	err = db.Get().Transaction(func(tx *gorm.DB) error {
		for _, entry := range req.Entries {
			var activeCount int64
			if err := tx.Model(&model.Order{}).
				Where("requester_id = ? AND meal_date = ? AND meal_slot = ? AND status IN ?", requesterID, entry.MealDate, entry.MealSlot, []string{orderStatusPending, orderStatusApproved}).
				Count(&activeCount).Error; err != nil {
				return err
			}
			if activeCount > 0 {
				return fmt.Errorf("%s %s 已存在未完成订单", entry.MealDate, mealLabel(entry.MealSlot))
			}

			requesterLabel := resolveRequesterDisplayName(requesterID)
			createdAt := time.Now()
			order := model.Order{
				OrderNo:      generateOrderNo(),
				RequesterID:  requesterID,
				UserName:     requesterLabel,
				ContactPhone: "",
				MealDate:     entry.MealDate,
				MealSlot:     entry.MealSlot,
				Status:       orderStatusPending,
				Remark:       req.Remark,
				CreatedAt:    createdAt,
				UpdatedAt:    createdAt,
			}
			if err := tx.Create(&order).Error; err != nil {
				return err
			}

			totalQuantity := 0
			for _, itemReq := range entry.Items {
				menuItem, ok := menuItemsMap[itemReq.MenuItemID]
				if !ok {
					return fmt.Errorf("菜品 %d 不存在", itemReq.MenuItemID)
				}
				if !menuItem.Enabled {
					return fmt.Errorf("菜品 %s 已下架", menuItem.Name)
				}
				if !containsString(deserializeMealSlots(menuItem.MealSlots), entry.MealSlot) {
					return fmt.Errorf("菜品 %s 不支持 %s", menuItem.Name, mealLabel(entry.MealSlot))
				}

				orderItem := model.OrderItem{
					OrderID:    order.ID,
					MenuItemID: menuItem.ID,
					Name:       menuItem.Name,
					Price:      menuItem.Price,
					Quantity:   itemReq.Quantity,
				}
				if err := tx.Create(&orderItem).Error; err != nil {
					return err
				}
				totalQuantity += itemReq.Quantity
			}

			workOrder := model.WorkOrder{
				OrderID:   order.ID,
				Title:     fmt.Sprintf("新预约工单 · %s %s", entry.MealDate, mealLabel(entry.MealSlot)),
				Detail:    fmt.Sprintf("%s 提交了 %s %s 预约，共 %d 份菜品。", requesterLabel, entry.MealDate, mealLabel(entry.MealSlot), totalQuantity),
				Status:    workOrderStatusPending,
				CreatedAt: createdAt,
				UpdatedAt: createdAt,
			}
			if err := tx.Create(&workOrder).Error; err != nil {
				return err
			}

			notifications = append(notifications, orderNotificationPayload{
				OrderNo:        order.OrderNo,
				MealDate:       entry.MealDate,
				MealSlot:       entry.MealSlot,
				MealLabel:      mealLabel(entry.MealSlot),
				ServeTime:      buildServeTime(entry.MealDate, entry.MealSlot),
				RequesterLabel: requesterLabel,
				Remark:         req.Remark,
				ItemSummary:    buildOrderItemSummary(entry.Items, menuItemsMap),
				TotalQuantity:  totalQuantity,
				CreatedAt:      createdAt,
			})
		}
		return nil
	})
	if err != nil {
		return err
	}

	notifyAdminsForNewOrders(notifications)
	return nil
}

func createDishRequest(requesterID string, req createDishRequestRequest) error {
	requesterID = strings.TrimSpace(requesterID)
	req.DishName = strings.TrimSpace(req.DishName)

	if requesterID == "" {
		return errors.New("未获取到微信身份，请重新进入小程序后再试")
	}
	if req.DishName == "" {
		return errors.New("请填写菜名")
	}
	if len([]rune(req.DishName)) > 30 {
		return errors.New("菜名不能超过 30 个字符")
	}

	requesterLabel := resolveRequesterDisplayName(requesterID)
	record := model.DishRequest{
		RequesterID: requesterID,
		UserName:    requesterLabel,
		DishName:    req.DishName,
		Status:      dishRequestStatusPending,
	}
	if err := db.Get().Create(&record).Error; err != nil {
		return err
	}

	notifyAdminsForDishRequest(orderNotificationPayload{
		OrderNo:        fmt.Sprintf("WISH-%d", record.ID),
		RequesterLabel: requesterLabel,
		ItemSummary:    "想吃什么：" + req.DishName,
		Remark:         "用户菜品建议",
		ServeTime:      record.CreatedAt.Format("2006-01-02 15:04"),
		CreatedAt:      record.CreatedAt,
	})
	return nil
}

func buildOrderItemSummary(items []createOrderEntryItem, menuItemsMap map[uint]model.MenuItem) string {
	parts := make([]string, 0, len(items))
	for _, item := range items {
		menuItem, ok := menuItemsMap[item.MenuItemID]
		if !ok {
			continue
		}
		parts = append(parts, fmt.Sprintf("%s x%d", menuItem.Name, item.Quantity))
	}
	return strings.Join(parts, "、")
}

func handleOrderAction(requesterID string, req orderActionRequest) error {
	requesterID = strings.TrimSpace(requesterID)
	if requesterID == "" {
		return errors.New("未获取到微信身份，请重新进入小程序后再试")
	}
	if req.OrderID == 0 {
		return errors.New("缺少 orderId")
	}
	if req.Action != "cancel" {
		return errors.New("当前仅支持 cancel 操作")
	}

	return db.Get().Transaction(func(tx *gorm.DB) error {
		var order model.Order
		if err := tx.First(&order, req.OrderID).Error; err != nil {
			return err
		}
		if order.RequesterID != requesterID {
			return errors.New("无权撤销该订单")
		}
		if order.Status != orderStatusPending && order.Status != orderStatusApproved {
			return errors.New("当前订单状态不允许撤销")
		}

		if err := tx.Model(&order).Updates(map[string]interface{}{
			"status":     orderStatusCancelled,
			"updated_at": time.Now(),
		}).Error; err != nil {
			return err
		}

		return tx.Model(&model.WorkOrder{}).
			Where("order_id = ?", order.ID).
			Updates(map[string]interface{}{
				"status":     workOrderStatusCancelled,
				"detail":     fmt.Sprintf("%s 已由用户撤销。", order.OrderNo),
				"updated_at": time.Now(),
			}).Error
	})
}

func handleDishRequestAction(req adminDishRequestActionRequest) error {
	if req.RequestID == 0 {
		return errors.New("缺少 requestId")
	}
	if req.Action != "accept" && req.Action != "reject" {
		return errors.New("当前仅支持 accept / reject")
	}

	status := dishRequestStatusAccepted
	reply := "管理员已采纳，后续会评估是否加入菜单。"
	if req.Action == "reject" {
		status = dishRequestStatusRejected
		reply = "管理员已查看，暂不安排。"
	}

	return db.Get().Model(&model.DishRequest{}).
		Where("id = ?", req.RequestID).
		Updates(map[string]interface{}{
			"status":      status,
			"admin_reply": reply,
			"updated_at":  time.Now(),
		}).Error
}

func reviewOrder(req adminOrderActionRequest) error {
	if req.OrderID == 0 {
		return errors.New("缺少 orderId")
	}
	if req.Action != "approve" && req.Action != "reject" {
		return errors.New("当前仅支持 approve / reject")
	}

	var notifyPayload orderNotificationPayload
	var requesterID string

	err := db.Get().Transaction(func(tx *gorm.DB) error {
		var order model.Order
		if err := tx.First(&order, req.OrderID).Error; err != nil {
			return err
		}
		if order.Status != orderStatusPending {
			return errors.New("只有待处理订单可以审核")
		}

		updateOrder := map[string]interface{}{
			"updated_at": time.Now(),
		}
		updateWorkOrder := map[string]interface{}{
			"updated_at": time.Now(),
		}

		if req.Action == "approve" {
			updateOrder["status"] = orderStatusApproved
			updateWorkOrder["status"] = workOrderStatusProcessed
			updateWorkOrder["detail"] = fmt.Sprintf("%s 已受理该预约订单。", order.OrderNo)
			updateOrder["reject_reason"] = ""
		} else {
			reason := strings.TrimSpace(req.Reason)
			if reason == "" {
				reason = "管理员已驳回，请调整日期或菜品后重新提交。"
			}
			updateOrder["status"] = orderStatusRejected
			updateOrder["reject_reason"] = reason
			updateWorkOrder["status"] = workOrderStatusRejected
			updateWorkOrder["detail"] = reason
		}

		if err := tx.Model(&order).Updates(updateOrder).Error; err != nil {
			return err
		}

		if err := tx.Model(&model.WorkOrder{}).
			Where("order_id = ?", order.ID).
			Updates(updateWorkOrder).Error; err != nil {
			return err
		}

		order.Status, _ = updateOrder["status"].(string)
		if reason, ok := updateOrder["reject_reason"].(string); ok {
			order.RejectReason = reason
		}

		orderItemsMap, err := loadOrderItems([]uint{order.ID})
		if err != nil {
			return err
		}

		totalQuantity := 0
		itemParts := make([]string, 0, len(orderItemsMap[order.ID]))
		for _, item := range orderItemsMap[order.ID] {
			totalQuantity += item.Quantity
			itemParts = append(itemParts, fmt.Sprintf("%s x%d", item.Name, item.Quantity))
		}

		requesterID = order.RequesterID
		notifyPayload = orderNotificationPayload{
			OrderNo:        order.OrderNo,
			MealDate:       order.MealDate,
			MealSlot:       order.MealSlot,
			MealLabel:      mealLabel(order.MealSlot),
			ServeTime:      buildServeTime(order.MealDate, order.MealSlot),
			RequesterLabel: order.UserName,
			Remark:         order.Remark,
			ItemSummary:    strings.Join(itemParts, "、"),
			TotalQuantity:  totalQuantity,
			Status:         order.Status,
			StatusLabel:    orderStatusLabel(order.Status),
			RejectReason:   orderNotificationRemark(order.Status, order.RejectReason),
			CreatedAt:      order.CreatedAt,
		}

		return nil
	})
	if err != nil {
		return err
	}

	notifyRequesterOrderStatus(requesterID, notifyPayload)
	return nil
}

func orderNotificationRemark(status, rejectReason string) string {
	if status == orderStatusApproved {
		return "订单已受理，请按时取餐。"
	}
	if strings.TrimSpace(rejectReason) != "" {
		return strings.TrimSpace(rejectReason)
	}
	return "订单状态已更新，请进入小程序查看。"
}

func dishRequestStatusText(status string) string {
	switch status {
	case dishRequestStatusPending:
		return "待处理"
	case dishRequestStatusAccepted:
		return "已采纳"
	case dishRequestStatusRejected:
		return "已忽略"
	default:
		return status
	}
}

func saveCategory(req adminCategoryRequest) error {
	req.Action = strings.TrimSpace(req.Action)
	req.Category.Name = strings.TrimSpace(req.Category.Name)

	if req.Category.Name == "" {
		return errors.New("分类名称不能为空")
	}
	if req.Category.Sort == 0 {
		req.Category.Sort = 10
	}

	if req.Action == "update" {
		if req.Category.ID == 0 {
			return errors.New("缺少分类 ID")
		}
		return db.Get().Model(&model.Category{}).
			Where("id = ?", req.Category.ID).
			Updates(map[string]interface{}{
				"name":       req.Category.Name,
				"sort":       req.Category.Sort,
				"enabled":    req.Category.Enabled,
				"updated_at": time.Now(),
			}).Error
	}

	category := model.Category{
		Name:    req.Category.Name,
		Sort:    req.Category.Sort,
		Enabled: req.Category.Enabled,
	}
	return db.Get().Create(&category).Error
}

func loadUserProfile(requesterID string) (*model.UserProfile, error) {
	requesterID = strings.TrimSpace(requesterID)
	if requesterID == "" {
		return nil, nil
	}

	var profile model.UserProfile
	if err := db.Get().Where("requester_id = ?", requesterID).First(&profile).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, err
	}

	return &profile, nil
}

func saveUserProfile(requesterID string, req saveProfileRequest) error {
	req.DisplayName = strings.TrimSpace(req.DisplayName)
	req.AvatarURL = strings.TrimSpace(req.AvatarURL)

	if req.DisplayName == "" {
		return errors.New("昵称不能为空")
	}
	if len([]rune(req.DisplayName)) > 20 {
		return errors.New("昵称不能超过 20 个字符")
	}

	profile, err := loadUserProfile(requesterID)
	if err != nil {
		return err
	}

	if profile == nil {
		profile = &model.UserProfile{
			RequesterID: requesterID,
			DisplayName: req.DisplayName,
			AvatarURL:   req.AvatarURL,
		}
		return db.Get().Create(profile).Error
	}

	return db.Get().Model(profile).Updates(map[string]interface{}{
		"display_name": req.DisplayName,
		"avatar_url":   req.AvatarURL,
		"updated_at":   time.Now(),
	}).Error
}

func resolveRequesterDisplayName(requesterID string) string {
	profile, err := loadUserProfile(requesterID)
	if err == nil && profile != nil && strings.TrimSpace(profile.DisplayName) != "" {
		return strings.TrimSpace(profile.DisplayName)
	}
	return buildRequesterLabel(requesterID)
}

func saveMenuItem(req adminMenuItemRequest) error {
	req.Action = strings.TrimSpace(req.Action)
	req.Item.Name = strings.TrimSpace(req.Item.Name)
	req.Item.Description = strings.TrimSpace(req.Item.Description)
	req.Item.ImageURL = strings.TrimSpace(req.Item.ImageURL)

	if req.Item.CategoryID == 0 {
		return errors.New("请选择菜品分类")
	}
	if req.Item.Name == "" {
		return errors.New("菜品名称不能为空")
	}
	if req.Item.Sort == 0 {
		req.Item.Sort = 10
	}
	if req.Item.Price < 0 {
		return errors.New("菜品价格不能小于 0")
	}

	normalizedMealSlots, err := normalizeMealSlotValues(req.Item.MealSlots)
	if err != nil {
		return err
	}

	var category model.Category
	if err := db.Get().First(&category, req.Item.CategoryID).Error; err != nil {
		return err
	}

	if req.Action == "update" {
		if req.Item.ID == 0 {
			return errors.New("缺少菜品 ID")
		}
		return db.Get().Model(&model.MenuItem{}).
			Where("id = ?", req.Item.ID).
			Updates(map[string]interface{}{
				"category_id": req.Item.CategoryID,
				"name":        req.Item.Name,
				"description": req.Item.Description,
				"image_url":   req.Item.ImageURL,
				"price":       req.Item.Price,
				"meal_slots":  serializeMealSlots(normalizedMealSlots),
				"sort":        req.Item.Sort,
				"enabled":     req.Item.Enabled,
				"updated_at":  time.Now(),
			}).Error
	}

	item := model.MenuItem{
		CategoryID:  req.Item.CategoryID,
		Name:        req.Item.Name,
		Description: req.Item.Description,
		ImageURL:    req.Item.ImageURL,
		Price:       req.Item.Price,
		MealSlots:   serializeMealSlots(normalizedMealSlots),
		Sort:        req.Item.Sort,
		Enabled:     req.Item.Enabled,
	}
	return db.Get().Create(&item).Error
}

func loadMenuItemsMap(menuItemIDs []uint) (map[uint]model.MenuItem, error) {
	result := map[uint]model.MenuItem{}
	if len(menuItemIDs) == 0 {
		return result, nil
	}

	uniqueIDs := make([]uint, 0, len(menuItemIDs))
	seen := map[uint]bool{}
	for _, id := range menuItemIDs {
		if !seen[id] {
			seen[id] = true
			uniqueIDs = append(uniqueIDs, id)
		}
	}

	var items []model.MenuItem
	if err := db.Get().Where("id IN ?", uniqueIDs).Find(&items).Error; err != nil {
		return nil, err
	}
	for _, item := range items {
		result[item.ID] = item
	}
	return result, nil
}

func validateMealDate(dateString string) error {
	targetDate, err := time.ParseInLocation("2006-01-02", dateString, time.Local)
	if err != nil {
		return errors.New("餐期日期格式错误")
	}

	now := time.Now()
	start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	end := start.AddDate(0, 0, 6)

	if targetDate.Before(start) || targetDate.After(end) {
		return errors.New("仅支持预约未来 7 天内的餐次")
	}
	return nil
}

func normalizeMealSlotValues(values []string) ([]string, error) {
	labelMap := buildMealSlotLabelMap()
	result := make([]string, 0, len(values))
	seen := map[string]bool{}

	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, ok := labelMap[value]; !ok {
			return nil, fmt.Errorf("餐次 %s 不支持", value)
		}
		if !seen[value] {
			seen[value] = true
			result = append(result, value)
		}
	}

	sort.Slice(result, func(i, j int) bool {
		return labelMap[result[i]].Order < labelMap[result[j]].Order
	})

	if len(result) == 0 {
		return nil, errors.New("至少选择一个供应餐次")
	}

	return result, nil
}

func deserializeMealSlots(payload string) []string {
	if strings.TrimSpace(payload) == "" {
		return []string{}
	}

	var result []string
	if err := json.Unmarshal([]byte(payload), &result); err == nil {
		return result
	}

	return []string{}
}

func serializeMealSlots(values []string) string {
	buffer, _ := json.Marshal(values)
	return string(buffer)
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func mealLabel(key string) string {
	if slot, ok := buildMealSlotLabelMap()[key]; ok {
		return slot.Label
	}
	return key
}

func orderStatusLabel(status string) string {
	switch status {
	case orderStatusPending:
		return "待处理"
	case orderStatusApproved:
		return "已受理"
	case orderStatusRejected:
		return "已驳回"
	case orderStatusCancelled:
		return "已撤销"
	default:
		return status
	}
}

func buildServeTime(mealDate, mealSlot string) string {
	switch mealSlot {
	case "breakfast":
		return mealDate + " 08:30"
	case "lunch":
		return mealDate + " 12:00"
	case "dinner":
		return mealDate + " 18:00"
	case "night_snack":
		return mealDate + " 22:30"
	default:
		return mealDate + " 12:00"
	}
}

func generateOrderNo() string {
	return fmt.Sprintf("BG%s%03d", time.Now().Format("20060102150405"), time.Now().Nanosecond()%1000)
}
