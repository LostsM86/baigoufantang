package model

import "time"

type DishRequest struct {
	ID          uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	RequesterID string    `gorm:"size:64;index;not null" json:"requesterId"`
	UserName    string    `gorm:"size:64;not null" json:"userName"`
	DishName    string    `gorm:"size:64;not null" json:"dishName"`
	Status      string    `gorm:"size:24;index;not null" json:"status"`
	AdminReply  string    `gorm:"size:128" json:"adminReply"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

func (DishRequest) TableName() string {
	return "food_dish_request"
}
