package model

import "time"

type WorkOrder struct {
	ID        uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	OrderID   uint      `gorm:"uniqueIndex;not null" json:"orderId"`
	Title     string    `gorm:"size:128;not null" json:"title"`
	Detail    string    `gorm:"type:text" json:"detail"`
	Status    string    `gorm:"size:24;index;not null" json:"status"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func (WorkOrder) TableName() string {
	return "food_work_order"
}
