package model

import "time"

type OrderItem struct {
	ID         uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	OrderID    uint      `gorm:"index;not null" json:"orderId"`
	MenuItemID uint      `gorm:"index;not null" json:"menuItemId"`
	Name       string    `gorm:"size:64;not null" json:"name"`
	Price      float64   `gorm:"type:decimal(10,2);not null;default:0" json:"price"`
	Quantity   int       `gorm:"not null;default:1" json:"quantity"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

func (OrderItem) TableName() string {
	return "food_order_item"
}
