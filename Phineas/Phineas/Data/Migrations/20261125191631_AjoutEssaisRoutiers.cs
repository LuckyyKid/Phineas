using System;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Phineas.Data.Migrations
{
    /// <inheritdoc />
    public partial class AjoutEssaisRoutiers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "EssaisRoutiers",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("MySql:ValueGenerationStrategy", MySqlValueGenerationStrategy.IdentityColumn),
                    OpportuniteId = table.Column<int>(type: "int", nullable: false),
                    VehiculeEnvisageId = table.Column<int>(type: "int", nullable: true),
                    VehiculeLibelle = table.Column<string>(type: "varchar(200)", maxLength: 200, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    DebutUtc = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    Fuseau = table.Column<string>(type: "varchar(64)", maxLength: 64, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    DureeMinutes = table.Column<int>(type: "int", nullable: false),
                    Commentaire = table.Column<string>(type: "varchar(500)", maxLength: 500, nullable: true)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    DateCreation = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EssaisRoutiers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EssaisRoutiers_OpportunitesVente_OpportuniteId",
                        column: x => x.OpportuniteId,
                        principalTable: "OpportunitesVente",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_EssaisRoutiers_VehiculesEnvisages_VehiculeEnvisageId",
                        column: x => x.VehiculeEnvisageId,
                        principalTable: "VehiculesEnvisages",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                })
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_EssaisRoutiers_OpportuniteId",
                table: "EssaisRoutiers",
                column: "OpportuniteId");

            migrationBuilder.CreateIndex(
                name: "IX_EssaisRoutiers_VehiculeEnvisageId",
                table: "EssaisRoutiers",
                column: "VehiculeEnvisageId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "EssaisRoutiers");
        }
    }
}
