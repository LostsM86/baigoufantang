package model

import "time"

type Order struct {
	ID           uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	OrderNo      string    `gorm:"size:48;uniqueIndex;not null" json:"orderNo"`
	RequesterID  string    `gorm:"size:64;index;not null" json:"requesterId"`
	UserName     string    `gorm:"size:64;not null" json:"userName"`
	ContactPhone string    `gorm:"size:32;not null" json:"contactPhone"`
	MealDate     string    `gorm:"size:10;index;not null" json:"mealDate"`
	MealSlot     string    `gorm:"size:24;index;not null" json:"mealSlot"`
	Status       string    `gorm:"size:24;index;not null" json:"status"`
	Remark       string    `gorm:"type:text" json:"remark"`
	RejectReason string    `gorm:"type:text" json:"rejectReason"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

func (Order) TableName() string {
	return "food_order"
}
